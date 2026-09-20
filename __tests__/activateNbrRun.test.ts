import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest'

// activateNbrRun is the admin-only Server Action that provisions a new run row
// linked to an NBR directory entry, assigns an initial run leader, and grants them
// the Clerk 'leader' role. This suite proves:
//   1. Pure pre-fill mapping: nbrRunToIdentity maps a known NBRRun to the right
//      identity/kind without touching the DB.
//   2. Auth gate: non-admin roles are refused by activateNbrRun.
//   3. Unknown nbrId: admin + bogus id → 'Unknown run', no row created.
//   4. Empty leaderEmail → error before any DB write.
//   5. Unknown leaderEmail → error before any DB write.
//   6. Test-data activation: round-trip with getRunById, nbr_directory_id stored,
//      run_leaders row inserted, Clerk role granted with publicMetadata merge.
//   7. Re-activation: second call for the same nbrId → 'This run is already activated'.
//   8. Non-Workout kind → workout_types stored as [].
//   9. Name derivation: email-only user → roster name is the email prefix.
//
// currentUser() is Clerk server context (no session in vitest), so it's mocked.
// clerkClient() is mocked so Clerk API calls never hit the network.
// updateTag() is a Server-Action-only Next primitive that throws outside a request,
// so it's stubbed. Everything else runs against the real test-data DB.

// vi.hoisted() runs before module imports and hoisted vi.mock() factories,
// so these refs are safely defined when the factory closure captures them.
const { mockGetUserList, mockUpdateUser } = vi.hoisted(() => ({
  mockGetUserList: vi.fn(),
  mockUpdateUser: vi.fn(),
}))

vi.mock('@clerk/nextjs/server', () => ({
  currentUser: vi.fn(),
  clerkClient: vi.fn().mockResolvedValue({
    users: {
      getUserList: mockGetUserList,
      updateUser: mockUpdateUser,
    },
  }),
}))
// Preserve the real next/cache exports (lib/db.ts uses unstable_cache at import
// time) and only stub updateTag, which throws outside a Server Action request.
vi.mock('next/cache', async importOriginal => {
  const actual = await importOriginal<typeof import('next/cache')>()
  return { ...actual, updateTag: vi.fn() }
})
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

import { currentUser } from '@clerk/nextjs/server'
import { sql, getRunById, getRunRoster } from '../lib/db'
import { activateNbrRun } from '../app/admin/actions'
import { nbrRunToIdentity } from '../lib/allRunsData'
import { NBR_RUNS } from '../lib/allRunsData'

// Test-data-only DB tests gated with describe.skipIf(!onTestData). CI sets
// DATABASE_URL to the test-data branch; local dev has no DATABASE_URL and the
// module fails to load off-test-data (same documented behavior as createRun.test.ts).
const TEST_DATA_HOST = 'ep-fragrant-sunset-atmdps9n-pooler.c-9.us-east-1.aws.neon.tech'
const onTestData = (process.env.DATABASE_URL ?? '').includes(TEST_DATA_HOST)

// Fixture name prefix — distinctive so cleanup never clobbers real rows.
const PREFIX = 'test-activate-361'

/** Set currentUser mock to a user with the given publicMetadata. */
function signInAs(id: string, { role, admin }: { role?: string; admin?: boolean } = {}) {
  vi.mocked(currentUser).mockResolvedValue({
    id,
    publicMetadata: { ...(role !== undefined ? { role } : {}), ...(admin !== undefined ? { admin } : {}) },
  } as never)
}

/**
 * Configure the clerkClient mock to simulate a resolved Clerk user.
 * The returned user is used to drive all Clerk-resolution paths.
 */
function mockClerkUser(opts: {
  id?: string
  firstName?: string | null
  lastName?: string | null
  username?: string | null
  email?: string
  publicMetadata?: Record<string, unknown>
} = {}) {
  const email = opts.email ?? 'leader@example.com'
  const user = {
    id: opts.id ?? 'clerk_user_test_361',
    firstName: opts.firstName ?? 'Test',
    lastName: opts.lastName ?? 'Leader',
    username: opts.username ?? null,
    emailAddresses: [{ emailAddress: email }],
    publicMetadata: opts.publicMetadata ?? {},
  }
  mockGetUserList.mockResolvedValue({ data: [user] })
  mockUpdateUser.mockResolvedValue(undefined)
  return user
}

/** Configure the mock to return no Clerk user — simulates an unknown email. */
function mockClerkUserNotFound() {
  mockGetUserList.mockResolvedValue({ data: [] })
}

// ---------------------------------------------------------------------------
// PURE — nbrRunToIdentity mapping (no DB, runs everywhere).
// ---------------------------------------------------------------------------

describe('nbrRunToIdentity pre-fill mapping', () => {
  test('wed-mourning-doves maps to correct identity and kind', () => {
    const run = NBR_RUNS.find(r => r.id === 'wed-mourning-doves')!
    expect(run).toBeDefined()
    const { identity, kind } = nbrRunToIdentity(run)

    expect(identity.name).toBe('Wednesday Mourning Doves')
    expect(identity.dayOfWeek).toBe('Wednesday')
    expect(identity.meetingTime).toBe('6:00am')
    expect(identity.meetingLocation).toBe('Tom Stofka Garden')
    expect(identity.emoji).toBe('')
    expect(identity.description).toBe('')
    // Long Runs category → 'Long' kind
    expect(kind).toBe('Long')
  })

  test("'Workouts' category maps to kind 'Workout'", () => {
    const run = NBR_RUNS.find(r => r.id === 'tue-tigerwolves')!
    expect(run).toBeDefined()
    const { kind } = nbrRunToIdentity(run)
    expect(kind).toBe('Workout')
  })

  test("'tue' day abbreviation maps to 'Tuesday'", () => {
    const run = NBR_RUNS.find(r => r.id === 'tue-tigerwolves')!
    expect(run).toBeDefined()
    const { identity } = nbrRunToIdentity(run)
    expect(identity.dayOfWeek).toBe('Tuesday')
  })
})

// ---------------------------------------------------------------------------
// AUTH — runs wherever the suite loads with DATABASE_URL (gate fires before DB).
// ---------------------------------------------------------------------------

describe('activateNbrRun authorization', () => {
  test('returns Unauthorized for a non-admin member', async () => {
    signInAs('user_activate_member_361', { role: 'member' })
    const res = await activateNbrRun({
      nbrId: 'wed-mourning-doves',
      identity: {
        name: 'Wednesday Mourning Doves',
        dayOfWeek: 'Wednesday',
        emoji: '',
        meetingTime: '6:00am',
        meetingLocation: 'Tom Stofka Garden',
        description: '',
      },
      kind: 'Long',
      workoutTypes: [],
      leaderEmail: 'leader@example.com',
    })
    expect(res.error).toBe('Unauthorized')
  })

  test('returns Unauthorized for a leader WITHOUT admin:true — leader ≠ admin', async () => {
    signInAs('user_activate_leader_361', { role: 'leader' })
    const res = await activateNbrRun({
      nbrId: 'wed-mourning-doves',
      identity: {
        name: 'Wednesday Mourning Doves',
        dayOfWeek: 'Wednesday',
        emoji: '',
        meetingTime: '6:00am',
        meetingLocation: 'Tom Stofka Garden',
        description: '',
      },
      kind: 'Long',
      workoutTypes: [],
      leaderEmail: 'leader@example.com',
    })
    expect(res.error).toBe('Unauthorized')
  })
})

// ---------------------------------------------------------------------------
// UNKNOWN nbrId — admin gate passes but nbrId is bogus (runs everywhere).
// ---------------------------------------------------------------------------

describe('activateNbrRun unknown nbrId', () => {
  test('admin + bogus nbrId not in NBR_RUNS → Unknown run, no row created', async () => {
    signInAs('user_activate_admin_361', { admin: true })
    const res = await activateNbrRun({
      nbrId: 'bogus-not-a-real-id',
      identity: {
        name: `${PREFIX}-bogus`,
        dayOfWeek: 'Wednesday',
        emoji: '',
        meetingTime: '6:00am',
        meetingLocation: 'Nowhere',
        description: '',
      },
      kind: 'Easy',
      workoutTypes: [],
      leaderEmail: 'leader@example.com',
    })
    expect(res.error).toBe('Unknown run')
    expect(res.runId).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// LEADER VALIDATION — pure checks (no DB needed; Clerk is mocked).
// ---------------------------------------------------------------------------

describe('activateNbrRun leader validation', () => {
  const VALID_IDENTITY = {
    name: 'Wednesday Mourning Doves',
    dayOfWeek: 'Wednesday' as const,
    emoji: '',
    meetingTime: '6:00am',
    meetingLocation: 'Tom Stofka Garden',
    description: '',
  }

  beforeAll(() => {
    signInAs('user_activate_admin_361', { admin: true })
  })

  test('empty leaderEmail → error, no run created, updateUser not called', async () => {
    mockClerkUser()
    mockGetUserList.mockClear()
    mockUpdateUser.mockClear()
    const res = await activateNbrRun({
      nbrId: 'wed-mourning-doves',
      identity: VALID_IDENTITY,
      kind: 'Long',
      workoutTypes: [],
      leaderEmail: '',
    })
    expect(res.error).toBe("Enter the run leader's email")
    expect(res.runId).toBeUndefined()
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  test('whitespace-only leaderEmail → error, no run created, updateUser not called', async () => {
    mockClerkUser()
    mockUpdateUser.mockClear()
    const res = await activateNbrRun({
      nbrId: 'wed-mourning-doves',
      identity: VALID_IDENTITY,
      kind: 'Long',
      workoutTypes: [],
      leaderEmail: '   ',
    })
    expect(res.error).toBe("Enter the run leader's email")
    expect(res.runId).toBeUndefined()
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  test('unknown email (no Clerk account) → "No account found…" error, no run created, updateUser not called', async () => {
    mockClerkUserNotFound()
    mockUpdateUser.mockClear()
    const res = await activateNbrRun({
      nbrId: 'wed-mourning-doves',
      identity: VALID_IDENTITY,
      kind: 'Long',
      workoutTypes: [],
      leaderEmail: 'nobody@example.com',
    })
    expect(res.error).toBe('No account found for that email — they need to sign in once before they can be added.')
    expect(res.runId).toBeUndefined()
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// TEST-DATA — real DB writes; skipped when DATABASE_URL is not the test-data branch.
// ---------------------------------------------------------------------------

describe.skipIf(!onTestData)('activateNbrRun test-data persistence', () => {
  // Track all run ids created during this suite so afterAll can delete them.
  const createdIds: string[] = []

  const ADMIN_USER = 'user_activate_admin_361'
  const LEADER_EMAIL = 'leader-test-361@example.com'
  const LEADER_CLERK_ID = 'clerk_leader_test_361'

  beforeAll(() => {
    signInAs(ADMIN_USER, { admin: true })
  })

  afterAll(async () => {
    // Clean up all fixture run + roster rows by explicit id.
    if (createdIds.length > 0) {
      for (const id of createdIds) {
        await sql`DELETE FROM run_leaders WHERE run_id = ${id}`
        await sql`DELETE FROM runs WHERE id = ${id}`
      }
    }
    // Belt-and-suspenders sweep for any fixture row with our distinctive prefix.
    await sql`DELETE FROM run_leaders WHERE run_id IN (SELECT id FROM runs WHERE id LIKE ${PREFIX + '%'})`
    await sql`DELETE FROM runs WHERE id LIKE ${PREFIX + '%'}`
    // Also sweep by the specific nbrIds used in these tests to catch any
    // rows where the name-derived slug doesn't start with PREFIX.
    await sql`DELETE FROM run_leaders WHERE run_id IN (SELECT id FROM runs WHERE nbr_directory_id IN ('wed-night-beginner', 'wed-night-road', 'fri-salmon', 'fri-donut', 'thu-hellkatz'))`
    await sql`DELETE FROM runs WHERE nbr_directory_id IN ('wed-night-beginner', 'wed-night-road', 'fri-salmon', 'fri-donut', 'thu-hellkatz')`
  })

  test('admin activates un-activated entry → runId returned; round-trips name/day_of_week/kind; nbr_directory_id stored', async () => {
    // Use wed-night-beginner — unlikely to be pre-activated in test-data
    const nbrId = 'wed-night-beginner'
    const nbrEntry = NBR_RUNS.find(r => r.id === nbrId)!
    const { identity, kind } = nbrRunToIdentity(nbrEntry)

    mockClerkUser({ id: LEADER_CLERK_ID, email: LEADER_EMAIL, firstName: 'Test', lastName: 'Leader' })
    mockUpdateUser.mockClear()

    const res = await activateNbrRun({ nbrId, identity, kind, workoutTypes: [], leaderEmail: LEADER_EMAIL })
    expect(res.error).toBeUndefined()
    expect(res.runId).toBeTruthy()
    createdIds.push(res.runId!)

    // Round-trip via getRunById
    const run = await getRunById(res.runId!)
    expect(run).not.toBeNull()
    expect(run!.name).toBe('Wednesday Night Beginner Run')
    expect(run!.dayOfWeek).toBe('Wednesday')
    expect(run!.kind).toBe('Beginner-Friendly')

    // nbr_directory_id must be stored
    const rows = await sql`SELECT nbr_directory_id FROM runs WHERE id = ${res.runId!}`
    expect(rows[0]?.nbr_directory_id).toBe(nbrId)

    // #353: newly activated run must be draft
    expect(run!.status).toBe('draft')
  })

  test('happy path: run_leaders row has correct clerk_user_id, name, sort_order=1, active=true; updateUser called with merged publicMetadata preserving admin:true', async () => {
    const nbrId = 'fri-donut'
    const nbrEntry = NBR_RUNS.find(r => r.id === nbrId)!
    const { identity, kind } = nbrRunToIdentity(nbrEntry)

    // Simulate a Clerk user who already has admin:true in their publicMetadata
    mockClerkUser({
      id: LEADER_CLERK_ID,
      email: LEADER_EMAIL,
      firstName: 'Test',
      lastName: 'Leader',
      publicMetadata: { admin: true },
    })
    mockUpdateUser.mockClear()

    const res = await activateNbrRun({ nbrId, identity, kind, workoutTypes: [], leaderEmail: LEADER_EMAIL })
    expect(res.error).toBeUndefined()
    expect(res.runId).toBeTruthy()
    createdIds.push(res.runId!)

    // Assert run_leaders row via getRunRoster
    const roster = await getRunRoster(res.runId!)
    expect(roster).toHaveLength(1)
    expect(roster[0].clerkUserId).toBe(LEADER_CLERK_ID)
    expect(roster[0].name).toBe('Test Leader')
    expect(roster[0].sortOrder).toBe(1)
    expect(roster[0].email).toBe(LEADER_EMAIL)
    // getRunRoster filters by active=true but doesn't return the field; assert via direct query
    const activeRows = await sql`SELECT active FROM run_leaders WHERE run_id = ${res.runId!} AND clerk_user_id = ${LEADER_CLERK_ID}`
    expect(activeRows[0]?.active).toBe(true)

    // Assert Clerk role grant was called with merged publicMetadata
    expect(mockUpdateUser).toHaveBeenCalledOnce()
    const [calledUserId, calledArgs] = mockUpdateUser.mock.calls[0] as [string, { publicMetadata: Record<string, unknown> }]
    expect(calledUserId).toBe(LEADER_CLERK_ID)
    // Must preserve admin:true AND add role:'leader'
    expect(calledArgs.publicMetadata).toEqual({ admin: true, role: 'leader' })
  })

  test('re-activation: same nbrId twice → second call returns "This run is already activated", no second row', async () => {
    const nbrId = 'wed-night-road'
    const nbrEntry = NBR_RUNS.find(r => r.id === nbrId)!
    const { identity, kind } = nbrRunToIdentity(nbrEntry)

    mockClerkUser({ id: LEADER_CLERK_ID, email: LEADER_EMAIL })

    const first = await activateNbrRun({ nbrId, identity, kind, workoutTypes: [], leaderEmail: LEADER_EMAIL })
    expect(first.error).toBeUndefined()
    expect(first.runId).toBeTruthy()
    createdIds.push(first.runId!)

    // Second activation of the same nbrId
    const second = await activateNbrRun({
      nbrId,
      identity: { ...identity, name: `${identity.name} Duplicate` },
      kind,
      workoutTypes: [],
      leaderEmail: LEADER_EMAIL,
    })
    expect(second.error).toBe('This run is already activated')
    expect(second.runId).toBeUndefined()

    // Only one row must exist for this nbrId
    const rows = await sql`SELECT id FROM runs WHERE nbr_directory_id = ${nbrId}`
    expect(rows.length).toBe(1)
  })

  test('non-Workout kind → workout_types stored as []', async () => {
    const nbrId = 'fri-salmon' // Food Runs → Food kind
    const nbrEntry = NBR_RUNS.find(r => r.id === nbrId)!
    const { identity, kind } = nbrRunToIdentity(nbrEntry)

    // Verify the kind is non-Workout
    expect(kind).toBe('Food')

    mockClerkUser({ id: LEADER_CLERK_ID, email: LEADER_EMAIL })

    const res = await activateNbrRun({
      nbrId,
      identity,
      kind,
      workoutTypes: ['Hills', 'Threshold'], // should be discarded for non-Workout kind
      leaderEmail: LEADER_EMAIL,
    })
    expect(res.error).toBeUndefined()
    expect(res.runId).toBeTruthy()
    createdIds.push(res.runId!)

    const run = await getRunById(res.runId!)
    expect(run!.workoutTypes).toEqual([])
  })

  test('name derivation: email-only user (no firstName/lastName/username) → roster name is the email prefix', async () => {
    // Dedicated nbrId for this test only — no other test in this file activates thu-hellkatz.
    const nbrId = 'thu-hellkatz'
    const nbrEntry = NBR_RUNS.find(r => r.id === nbrId)!
    const { identity, kind } = nbrRunToIdentity(nbrEntry)
    const emailOnlyEmail = 'jdoe@nbr.example.com'

    // Mock a Clerk user with only an email (no names/username)
    mockGetUserList.mockResolvedValue({
      data: [{
        id: 'clerk_emailonly_361',
        firstName: null,
        lastName: null,
        username: null,
        emailAddresses: [{ emailAddress: emailOnlyEmail }],
        publicMetadata: {},
      }],
    })
    mockUpdateUser.mockResolvedValue(undefined)

    const res = await activateNbrRun({ nbrId, identity, kind, workoutTypes: [], leaderEmail: emailOnlyEmail })
    expect(res.error).toBeUndefined()
    expect(res.runId).toBeTruthy()
    createdIds.push(res.runId!)

    // The roster name should be the email prefix ('jdoe')
    const roster = await getRunRoster(res.runId!)
    expect(roster[0].name).toBe('jdoe')
  })
})
