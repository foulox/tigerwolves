import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest'

// toggleRunFollow (#330) is the runner follow/unfollow write path — open to ANY
// signed-in user (not leader-only). currentUser() is Clerk server context (mocked);
// updateTag() throws outside a Server Action (stubbed, real next/cache otherwise so
// lib/db's unstable_cache still imports). The DB is real test-data — the write tests
// provision their own run + user and clean up, so they never touch shared fixtures.
vi.mock('@clerk/nextjs/server', () => ({ currentUser: vi.fn(), clerkClient: vi.fn() }))
vi.mock('next/cache', async importOriginal => {
  const actual = await importOriginal<typeof import('next/cache')>()
  return { ...actual, updateTag: vi.fn() }
})
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))

import { currentUser } from '@clerk/nextjs/server'
import { sql } from '../lib/db'
import { toggleRunFollow } from '../app/actions'
import { setRunStatus } from '../app/run-config/actions'

const TEST_DATA_HOST = 'ep-fragrant-sunset-atmdps9n-pooler.c-9.us-east-1.aws.neon.tech'
const onTestData = (process.env.DATABASE_URL ?? '').includes(TEST_DATA_HOST)

function signInAs(clerkId: string | null) {
  vi.mocked(currentUser).mockResolvedValue(clerkId ? ({ id: clerkId } as never) : (null as never))
}

// The auth guard short-circuits before any DB access, so this runs without test-data.
describe('toggleRunFollow authorization', () => {
  test('returns Unauthorized when signed out', async () => {
    signInAs(null)
    const res = await toggleRunFollow('tuesday-morning-tigerwolves')
    expect(res.error).toBe('Unauthorized')
  })
})

describe.skipIf(!onTestData)('toggleRunFollow follow/unfollow (test-data)', () => {
  const RUN = 'test-follow-330'
  const RUNNER = 'user_follow_330' // a signed-in NON-leader

  beforeAll(async () => {
    await sql`INSERT INTO runs (id, name) VALUES (${RUN}, 'Follow Test 330') ON CONFLICT (id) DO NOTHING`
    await sql`DELETE FROM runner_follows WHERE clerk_user_id = ${RUNNER} AND run_id = ${RUN}`
  })

  afterAll(async () => {
    await sql`DELETE FROM runner_follows WHERE clerk_user_id = ${RUNNER} AND run_id = ${RUN}`
    await sql`DELETE FROM runs WHERE id = ${RUN}`
  })

  test('a signed-in user can follow then unfollow; state and row toggle', async () => {
    signInAs(RUNNER)

    const first = await toggleRunFollow(RUN)
    expect(first.error).toBeUndefined()
    expect(first.following).toBe(true)
    let rows = await sql`SELECT 1 FROM runner_follows WHERE clerk_user_id = ${RUNNER} AND run_id = ${RUN}`
    expect(rows.length).toBe(1)

    const second = await toggleRunFollow(RUN)
    expect(second.error).toBeUndefined()
    expect(second.following).toBe(false)
    rows = await sql`SELECT 1 FROM runner_follows WHERE clerk_user_id = ${RUNNER} AND run_id = ${RUN}`
    expect(rows.length).toBe(0)
  })

  test('rejects a follow on a nonexistent run', async () => {
    signInAs(RUNNER)
    const res = await toggleRunFollow('no-such-run-330')
    expect(res.error).toBe('Run not found')
  })
})

describe.skipIf(!onTestData)('toggleRunFollow draft-gate (#353)', () => {
  const RUN = 'test-draft-follow-353'
  const OWNER = 'user_draft_owner_353' // leader who owns this run
  const RUNNER = 'user_draft_runner_353' // non-owner signed-in user

  beforeAll(async () => {
    // Create the draft run
    await sql`
      INSERT INTO runs (id, name, status) VALUES (${RUN}, 'Draft Follow Test 353', 'draft')
      ON CONFLICT (id) DO NOTHING
    `
    // Update to draft in case the run already existed as live
    await sql`UPDATE runs SET status = 'draft' WHERE id = ${RUN}`
    // Create an owning leader row so getLeaderRun(OWNER)?.id === RUN
    await sql`DELETE FROM run_leaders WHERE clerk_user_id = ${OWNER} AND run_id = ${RUN}`
    await sql`
      INSERT INTO run_leaders (run_id, name, clerk_user_id, sort_order, active)
      VALUES (${RUN}, 'Draft Owner 353', ${OWNER}, 1, true)
    `
    // Clean up any stale follows
    await sql`DELETE FROM runner_follows WHERE run_id = ${RUN}`
  })

  afterAll(async () => {
    await sql`DELETE FROM runner_follows WHERE run_id = ${RUN}`
    await sql`DELETE FROM run_leaders WHERE run_id = ${RUN}`
    await sql`DELETE FROM runs WHERE id = ${RUN}`
  })

  test('a runner (non-owner) cannot follow a draft run', async () => {
    signInAs(RUNNER)
    const res = await toggleRunFollow(RUN)
    expect(res.error).toBe("This run isn't open to join yet")
    const rows = await sql`SELECT 1 FROM runner_follows WHERE clerk_user_id = ${RUNNER} AND run_id = ${RUN}`
    expect(rows.length).toBe(0)
  })

  test('the owning leader CAN follow their own draft run', async () => {
    // sign in as owner — currentUser must return the leader metadata for setRunStatus but
    // toggleRunFollow only calls requireUser() which reads id; we provide role for safety
    vi.mocked(currentUser).mockResolvedValue({ id: OWNER, publicMetadata: { role: 'leader' } } as never)
    const res = await toggleRunFollow(RUN)
    expect(res.error).toBeUndefined()
    expect(res.following).toBe(true)
    const rows = await sql`SELECT 1 FROM runner_follows WHERE clerk_user_id = ${OWNER} AND run_id = ${RUN}`
    expect(rows.length).toBe(1)
  })

  test('an admin (non-owner) CAN follow a draft run', async () => {
    // #365: admins manage any draft — the client shows them the Join button, so
    // toggleRunFollow must honor it (regression: admin was refused as a non-owner).
    const ADMIN = 'user_draft_admin_353'
    vi.mocked(currentUser).mockResolvedValue({ id: ADMIN, publicMetadata: { admin: true } } as never)
    const res = await toggleRunFollow(RUN)
    expect(res.error).toBeUndefined()
    expect(res.following).toBe(true)
    const rows = await sql`SELECT 1 FROM runner_follows WHERE clerk_user_id = ${ADMIN} AND run_id = ${RUN}`
    expect(rows.length).toBe(1)
  })

  test('after setRunStatus to live, the non-owner runner can follow', async () => {
    // Flip run to live — setRunStatus checks ownership; sign in as owner
    vi.mocked(currentUser).mockResolvedValue({ id: OWNER, publicMetadata: { role: 'leader' } } as never)
    const statusRes = await setRunStatus(RUN, 'live')
    expect(statusRes.error).toBeUndefined()
    expect(statusRes.status).toBe('live')

    // Now the non-owner runner should be able to follow
    signInAs(RUNNER)
    const res = await toggleRunFollow(RUN)
    expect(res.error).toBeUndefined()
    expect(res.following).toBe(true)
    const rows = await sql`SELECT 1 FROM runner_follows WHERE clerk_user_id = ${RUNNER} AND run_id = ${RUN}`
    expect(rows.length).toBe(1)
  })
})
