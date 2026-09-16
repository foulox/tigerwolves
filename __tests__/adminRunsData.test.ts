import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { sql, getFollowerCounts, getActiveLeadersByRun } from '../lib/db'

// DB-touching tests: only run against the staging E2E-wipe branch.
// These skip locally (where DATABASE_URL points at production) and only execute
// in CI. That is expected and correct — see CLAUDE.md "Test-run reality".
const STAGING_HOST = 'ep-fragrant-sunset-atmdps9n-pooler.c-9.us-east-1.aws.neon.tech'
const onStaging = (process.env.DATABASE_URL ?? '').includes(STAGING_HOST)

describe.skipIf(!onStaging)('getFollowerCounts and getActiveLeadersByRun (staging)', () => {
  // Isolated run ids that only this suite uses. run_leaders has no FK to runs, so we
  // insert minimal runs rows and clean up both tables in afterAll.
  const RUN_A = 'test-admin-378-a'
  const RUN_B = 'test-admin-378-b'  // will have no followers — proves the zero-count case
  const RUN_C = 'test-admin-378-c'  // two followers, two leaders (one active, one deactivated)

  const FOLLOWER_1 = 'user_admin378_follower1'
  const FOLLOWER_2 = 'user_admin378_follower2'
  const FOLLOWER_3 = 'user_admin378_follower3'

  beforeAll(async () => {
    // Seed runs — runner_follows.run_id has a FK to runs(id)
    await sql`INSERT INTO runs (id, name) VALUES (${RUN_A}, 'Admin Test 378 A') ON CONFLICT (id) DO NOTHING`
    await sql`INSERT INTO runs (id, name) VALUES (${RUN_B}, 'Admin Test 378 B') ON CONFLICT (id) DO NOTHING`
    await sql`INSERT INTO runs (id, name) VALUES (${RUN_C}, 'Admin Test 378 C') ON CONFLICT (id) DO NOTHING`

    // Clean existing fixture data (handles re-runs)
    await sql`DELETE FROM runner_follows WHERE clerk_user_id IN (${FOLLOWER_1}, ${FOLLOWER_2}, ${FOLLOWER_3})`
    await sql`DELETE FROM run_leaders WHERE run_id IN (${RUN_A}, ${RUN_B}, ${RUN_C})`

    // Followers: RUN_A gets 1, RUN_B gets 0, RUN_C gets 2
    await sql`INSERT INTO runner_follows (clerk_user_id, run_id) VALUES (${FOLLOWER_1}, ${RUN_A})`
    await sql`INSERT INTO runner_follows (clerk_user_id, run_id) VALUES (${FOLLOWER_2}, ${RUN_C})`
    await sql`INSERT INTO runner_follows (clerk_user_id, run_id) VALUES (${FOLLOWER_3}, ${RUN_C})`

    // Leaders: RUN_A has one active leader; RUN_C has one active + one deactivated
    await sql`
      INSERT INTO run_leaders (run_id, name, email, sort_order, active) VALUES
        (${RUN_A}, 'Admin Test Leader A1', 'leader-a1@example.com', 1, true),
        (${RUN_C}, 'Admin Test Leader C1', 'leader-c1@example.com', 1, true),
        (${RUN_C}, 'Admin Test Leader C2 (deactivated)', 'leader-c2@example.com', 2, false)
    `
  })

  afterAll(async () => {
    await sql`DELETE FROM runner_follows WHERE clerk_user_id IN (${FOLLOWER_1}, ${FOLLOWER_2}, ${FOLLOWER_3})`
    await sql`DELETE FROM run_leaders WHERE run_id IN (${RUN_A}, ${RUN_B}, ${RUN_C})`
    await sql`DELETE FROM runs WHERE id IN (${RUN_A}, ${RUN_B}, ${RUN_C})`
  })

  test('getFollowerCounts returns correct per-run counts including 0 for a follower-less run', async () => {
    const counts = await getFollowerCounts([RUN_A, RUN_B, RUN_C])

    // All three input ids must be present as keys
    expect(Object.keys(counts).sort()).toEqual([RUN_A, RUN_B, RUN_C].sort())

    expect(counts[RUN_A]).toBe(1)
    expect(counts[RUN_B]).toBe(0)   // no followers — must be 0, not missing
    expect(counts[RUN_C]).toBe(2)
  })

  test('getActiveLeadersByRun groups active leaders by run and omits deactivated rows', async () => {
    const leaders = await getActiveLeadersByRun([RUN_A, RUN_B, RUN_C])

    // All three input ids must be present as keys
    expect(Object.keys(leaders).sort()).toEqual([RUN_A, RUN_B, RUN_C].sort())

    // RUN_A: one active leader
    expect(leaders[RUN_A]).toHaveLength(1)
    expect(leaders[RUN_A][0].name).toBe('Admin Test Leader A1')
    expect(leaders[RUN_A][0].email).toBe('leader-a1@example.com')

    // RUN_B: no leaders at all
    expect(leaders[RUN_B]).toHaveLength(0)

    // RUN_C: one active leader only — deactivated leader must be omitted
    expect(leaders[RUN_C]).toHaveLength(1)
    expect(leaders[RUN_C][0].name).toBe('Admin Test Leader C1')
    expect(leaders[RUN_C][0].email).toBe('leader-c1@example.com')
    // Confirm the deactivated leader is not in the result
    const runCNames = leaders[RUN_C].map(l => l.name)
    expect(runCNames).not.toContain('Admin Test Leader C2 (deactivated)')
  })
})

describe('getFollowerCounts and getActiveLeadersByRun — empty input (no DB needed)', () => {
  // These verify the empty-array guard without touching the DB at runtime,
  // but the file still imports from ../lib/db (which throws if DATABASE_URL is
  // unset at module load time). They run anywhere DATABASE_URL is set — CI and
  // any local env with a DB URL configured.

  test('getFollowerCounts returns {} for an empty runIds array', async () => {
    const counts = await getFollowerCounts([])
    expect(counts).toEqual({})
  })

  test('getActiveLeadersByRun returns {} for an empty runIds array', async () => {
    const leaders = await getActiveLeadersByRun([])
    expect(leaders).toEqual({})
  })
})
