import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest'

// createRun is the admin-only Server Action that provisions a new run row.
// This suite proves:
//   1. The admin gate: non-admin members and leaders-without-admin:true are refused.
//   2. Staging persistence: round-trip via getRunById, slug generation, collision
//      handling, validation rejections, and kind/workoutTypes handling.
//
// currentUser() is Clerk server context (no session in vitest), so it's mocked.
// updateTag() is a Server-Action-only Next primitive that throws outside a request,
// so it's stubbed. Everything else runs against the real staging DB.
vi.mock('@clerk/nextjs/server', () => ({
  currentUser: vi.fn(),
  clerkClient: vi.fn(),
}))
// Preserve the real next/cache exports (lib/db.ts uses unstable_cache at import
// time) and only stub updateTag, which throws outside a Server Action request.
vi.mock('next/cache', async importOriginal => {
  const actual = await importOriginal<typeof import('next/cache')>()
  return { ...actual, updateTag: vi.fn() }
})
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

import { currentUser } from '@clerk/nextjs/server'
import { sql, getRunById } from '../lib/db'
import { createRun } from '../app/admin/actions'

// Staging-only DB tests gated with describe.skipIf(!onStaging). CI sets
// DATABASE_URL to the staging branch; local dev has no DATABASE_URL and the
// module fails to load off-staging (same documented behavior as runConfigAuth.test.ts).
const STAGING_HOST = 'ep-fragrant-sunset-atmdps9n-pooler.c-9.us-east-1.aws.neon.tech'
const onStaging = (process.env.DATABASE_URL ?? '').includes(STAGING_HOST)

// Fixture name prefix — distinctive so cleanup never clobbers real rows.
const PREFIX = 'test-create-349'

/** Set currentUser mock to a user with the given publicMetadata. */
function signInAs(id: string, { role, admin }: { role?: string; admin?: boolean } = {}) {
  vi.mocked(currentUser).mockResolvedValue({
    id,
    publicMetadata: { ...(role !== undefined ? { role } : {}), ...(admin !== undefined ? { admin } : {}) },
  } as never)
}

/** Minimal valid identity payload reused across tests. */
const BASE_IDENTITY = {
  name: 'CreateRun Test Run 349',
  dayOfWeek: 'Wednesday',
  emoji: '🐢',
  meetingTime: '7:00am',
  meetingLocation: 'The Arch',
  description: 'A test run',
  warmupDescription: 'Easy jog',
}

// ---------------------------------------------------------------------------
// UNAUTHORIZED — these run wherever the suite loads with DATABASE_URL because
// the admin gate short-circuits before any DB write.
// ---------------------------------------------------------------------------

describe('createRun authorization', () => {
  test('returns Unauthorized for a non-admin member', async () => {
    signInAs('user_createrun_member_349', { role: 'member' })
    const res = await createRun({ identity: BASE_IDENTITY, kind: 'Easy', workoutTypes: [] })
    expect(res.error).toBe('Unauthorized')
  })

  test('returns Unauthorized for a leader WITHOUT admin:true — leader ≠ admin', async () => {
    signInAs('user_createrun_leader_349', { role: 'leader' })
    const res = await createRun({ identity: BASE_IDENTITY, kind: 'Easy', workoutTypes: [] })
    expect(res.error).toBe('Unauthorized')
  })
})

// ---------------------------------------------------------------------------
// STAGING — real DB writes; skipped when DATABASE_URL is not the staging branch.
// ---------------------------------------------------------------------------

describe.skipIf(!onStaging)('createRun staging persistence', () => {
  // Track all run ids created during this suite so afterAll can delete them.
  const createdIds: string[] = []

  const ADMIN_USER = 'user_createrun_admin_349'

  beforeAll(() => {
    signInAs(ADMIN_USER, { admin: true })
  })

  afterAll(async () => {
    // Clean up all fixture rows by explicit id. IDs are slugged, so we can also
    // sweep by prefix to catch collision variants (mourning-doves-*, -2, etc.).
    if (createdIds.length > 0) {
      for (const id of createdIds) {
        await sql`DELETE FROM runs WHERE id = ${id}`
      }
    }
    // Belt-and-suspenders sweep for any fixture row with our distinctive prefix
    // that wasn't tracked (e.g. a test left early).
    await sql`DELETE FROM runs WHERE id LIKE ${PREFIX + '%'}`
    await sql`DELETE FROM runs WHERE id LIKE ${'mourning-doves-349%'}`
  })

  test('admin creates a run — returns runId, getRunById round-trips fields', async () => {
    const res = await createRun({
      identity: {
        name: `${PREFIX}-basic`,
        dayOfWeek: 'Wednesday',
        emoji: '🐢',
        meetingTime: '7:00am',
        meetingLocation: 'The Arch',
        description: 'A test run',
        warmupDescription: 'Easy jog',
      },
      kind: 'Easy',
      workoutTypes: [],
    })
    expect(res.error).toBeUndefined()
    expect(res.runId).toBeTruthy()
    createdIds.push(res.runId!)

    const run = await getRunById(res.runId!)
    expect(run).not.toBeNull()
    expect(run!.name).toBe(`${PREFIX}-basic`)
    expect(run!.dayOfWeek).toBe('Wednesday')
    expect(run!.emoji).toBe('🐢')
    expect(run!.kind).toBe('Easy')
    expect(run!.workoutTypes).toEqual([])
  })

  test('run_group_id is NULL and zero workout_families rows reference it', async () => {
    const res = await createRun({
      identity: {
        name: `${PREFIX}-nullgroup`,
        dayOfWeek: 'Thursday',
        emoji: '🐢',
        meetingTime: '6:30am',
        meetingLocation: 'South Gate',
        description: '',
        warmupDescription: '',
      },
      kind: 'Long',
      workoutTypes: [],
    })
    expect(res.runId).toBeTruthy()
    createdIds.push(res.runId!)

    const row = await sql`SELECT run_group_id FROM runs WHERE id = ${res.runId!}`
    expect(row[0].run_group_id).toBeNull()

    // No workout_families rows reference the new run (inherits shared library).
    const families = await sql`SELECT 1 FROM workout_families WHERE run_id = ${res.runId!}`
    expect(families.length).toBe(0)
  })

  test("slug from 'Mourning Doves …' name → runId starts 'mourning-doves'", async () => {
    const res = await createRun({
      identity: {
        name: 'Mourning Doves 349',
        dayOfWeek: 'Wednesday',
        emoji: '🕊️',
        meetingTime: '6:00am',
        meetingLocation: 'Prospect Park',
        description: '',
        warmupDescription: '',
      },
      kind: 'Easy',
      workoutTypes: [],
    })
    expect(res.runId).toBeTruthy()
    createdIds.push(res.runId!)
    expect(res.runId!.startsWith('mourning-doves')).toBe(true)
  })

  test('collision: two same-name creates → distinct ids, second gets -2, both rows exist', async () => {
    const name = 'Mourning Doves 349'
    // First create — should already exist from previous test, so we expect the
    // slug collision path to kick in for our second create below. But the previous
    // test may have produced 'mourning-doves-349', so let's create a fresh
    // collision pair with a unique-enough name to be deterministic.
    const collisionName = `${PREFIX}-collision`
    const first = await createRun({
      identity: {
        name: collisionName,
        dayOfWeek: 'Monday',
        emoji: '⚡',
        meetingTime: '6:00am',
        meetingLocation: 'Fort Greene',
        description: '',
        warmupDescription: '',
      },
      kind: 'Easy',
      workoutTypes: [],
    })
    expect(first.runId).toBeTruthy()
    createdIds.push(first.runId!)

    const second = await createRun({
      identity: {
        name: collisionName,
        dayOfWeek: 'Monday',
        emoji: '⚡',
        meetingTime: '6:00am',
        meetingLocation: 'Fort Greene',
        description: '',
        warmupDescription: '',
      },
      kind: 'Easy',
      workoutTypes: [],
    })
    expect(second.runId).toBeTruthy()
    createdIds.push(second.runId!)

    // IDs must be distinct.
    expect(first.runId).not.toBe(second.runId)

    // Second id should be the first id with '-2' appended.
    expect(second.runId).toBe(`${first.runId}-2`)

    // Both rows must exist in the DB.
    const rows = await sql`SELECT id FROM runs WHERE id IN (${first.runId!}, ${second.runId!})`
    expect(rows.length).toBe(2)
  })

  test('invalid kind → "Invalid run kind"', async () => {
    const res = await createRun({
      identity: BASE_IDENTITY,
      kind: 'NotARealKind',
      workoutTypes: [],
    })
    expect(res.error).toBe('Invalid run kind')
  })

  test('empty name → "Name is required"', async () => {
    const res = await createRun({
      identity: { ...BASE_IDENTITY, name: '   ' },
      kind: 'Easy',
      workoutTypes: [],
    })
    expect(res.error).toBe('Name is required')
  })

  test('non-Workout kind → workout_types stored as []', async () => {
    const res = await createRun({
      identity: {
        name: `${PREFIX}-nonworkout`,
        dayOfWeek: 'Friday',
        emoji: '🏃',
        meetingTime: '7:00am',
        meetingLocation: 'The Park',
        description: '',
        warmupDescription: '',
      },
      kind: 'Easy',
      workoutTypes: ['Hills', 'Threshold'], // should be discarded for non-Workout kind
    })
    expect(res.runId).toBeTruthy()
    createdIds.push(res.runId!)

    const run = await getRunById(res.runId!)
    expect(run!.workoutTypes).toEqual([])
  })
})
