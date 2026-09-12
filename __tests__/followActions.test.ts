import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest'

// toggleRunFollow (#330) is the runner follow/unfollow write path — open to ANY
// signed-in user (not leader-only). currentUser() is Clerk server context (mocked);
// updateTag() throws outside a Server Action (stubbed, real next/cache otherwise so
// lib/db's unstable_cache still imports). The DB is real staging — the write tests
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

const STAGING_HOST = 'ep-fragrant-sunset-atmdps9n-pooler.c-9.us-east-1.aws.neon.tech'
const onStaging = (process.env.DATABASE_URL ?? '').includes(STAGING_HOST)

function signInAs(clerkId: string | null) {
  vi.mocked(currentUser).mockResolvedValue(clerkId ? ({ id: clerkId } as never) : (null as never))
}

// The auth guard short-circuits before any DB access, so this runs without staging.
describe('toggleRunFollow authorization', () => {
  test('returns Unauthorized when signed out', async () => {
    signInAs(null)
    const res = await toggleRunFollow('tigerwolves')
    expect(res.error).toBe('Unauthorized')
  })
})

describe.skipIf(!onStaging)('toggleRunFollow follow/unfollow (staging)', () => {
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
