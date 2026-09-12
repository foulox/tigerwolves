import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest'

// The run-config server actions are the write path for a leader's own run. This
// suite proves the authorization boundary: a leader can act on the run they lead,
// but every action refuses (returns 'Forbidden') when pointed at a run — or a
// roster row belonging to a run — they do not lead.
//
// currentUser()/clerkClient() are Clerk server context (no session in vitest), so
// they're mocked. updateTag() is a Server-Action-only Next primitive that throws
// outside a request, so it's stubbed. Everything else runs against the real staging
// DB — the guards (assertCallerOwnsRun / assertCallerOwnsLeaderRow) do real lookups.
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
import { sql, getLeaderRun } from '../lib/db'
import {
  saveRotationOrder,
  saveAwayPeriod,
  removeRunLeader,
  addRunLeaderByEmail,
  saveRunProfile,
  saveRunCycle,
} from '../app/run-config/actions'

// These tests write run_leaders/runs rows, so they only run against the staging
// branch — never production (which is what .env.local's DATABASE_URL points at
// during a local `npm run test:unit`). CI sets DATABASE_URL to staging.
const STAGING_HOST = 'ep-fragrant-sunset-atmdps9n-pooler.c-9.us-east-1.aws.neon.tech'
const onStaging = (process.env.DATABASE_URL ?? '').includes(STAGING_HOST)

const LEADER_A = 'user_authtest_A_310' // leads tigerwolves
const LEADER_B = 'user_authtest_B_310' // leads the other run
const OTHER_RUN = 'test-doves-310'
const NAME_A = 'AuthTest LeaderA 310'
const NAME_B = 'AuthTest LeaderB 310'

let leaderAId: number
let leaderBId: number

function signInAs(clerkId: string, role: string = 'leader') {
  vi.mocked(currentUser).mockResolvedValue({ id: clerkId, publicMetadata: { role } } as never)
}

describe.skipIf(!onStaging)('run-leader access is scoped to the run they lead', () => {
  // Hooks live inside the guarded describe so no DB writes happen when skipped.
  beforeAll(async () => {
    // A second run this leader does NOT lead. tigerwolves already exists on staging.
    await sql`INSERT INTO runs (id, name) VALUES (${OTHER_RUN}, 'Auth Test Doves 310') ON CONFLICT (id) DO NOTHING`
    await sql`DELETE FROM run_leaders WHERE name IN (${NAME_A}, ${NAME_B})`
    const a = await sql`
      INSERT INTO run_leaders (run_id, name, clerk_user_id, sort_order, active)
      VALUES ('tigerwolves', ${NAME_A}, ${LEADER_A}, 990, true)
      RETURNING id
    `
    leaderAId = a[0].id as number
    const b = await sql`
      INSERT INTO run_leaders (run_id, name, clerk_user_id, sort_order, active)
      VALUES (${OTHER_RUN}, ${NAME_B}, ${LEADER_B}, 1, true)
      RETURNING id
    `
    leaderBId = b[0].id as number
  })

  afterAll(async () => {
    await sql`DELETE FROM run_leaders WHERE name IN (${NAME_A}, ${NAME_B})`
    await sql`DELETE FROM runs WHERE id = ${OTHER_RUN}`
  })

  test('each leader resolves only to the run they lead', async () => {
    expect((await getLeaderRun(LEADER_A))?.id).toBe('tigerwolves')
    expect((await getLeaderRun(LEADER_B))?.id).toBe(OTHER_RUN)
    // the tigerwolves leader must not resolve to the run they don't lead
    expect((await getLeaderRun(LEADER_A))?.id).not.toBe(OTHER_RUN)
  })

  describe('as the tigerwolves leader', () => {
    beforeAll(() => signInAs(LEADER_A))

    test('CAN reorder rotation within their own run', async () => {
      const res = await saveRotationOrder([leaderAId])
      expect(res.error).toBeUndefined()
    })

    test('CANNOT add a leader to a run they do not lead', async () => {
      const res = await addRunLeaderByEmail(OTHER_RUN, 'whoever@example.com')
      expect(res.error).toBe('Forbidden')
    })

    test("CANNOT set an away period on another run's leader", async () => {
      const res = await saveAwayPeriod(leaderBId, { from: '2099-01-01', to: '2099-01-07' })
      expect(res.error).toBe('Forbidden')
    })

    test("CANNOT remove another run's leader", async () => {
      const res = await removeRunLeader(leaderBId)
      expect(res.error).toBe('Forbidden')
    })

    test("CANNOT reorder rotation using another run's leader ids", async () => {
      const res = await saveRotationOrder([leaderBId])
      expect(res.error).toBe('Forbidden')
    })
  })

  describe('a signed-in NON-leader (role !== leader)', () => {
    // The role gate is the only thing standing between a self-signed-up account and
    // write access (Clerk runs in Open mode) — prove every run-config action refuses.
    beforeAll(() => signInAs(LEADER_A, 'member'))

    test('is rejected with Unauthorized on every run-config action', async () => {
      expect((await saveRotationOrder([leaderAId])).error).toBe('Unauthorized')
      expect((await saveAwayPeriod(leaderAId, { from: '2099-01-01', to: '2099-01-07' })).error).toBe('Unauthorized')
      expect((await removeRunLeader(leaderAId)).error).toBe('Unauthorized')
      expect((await addRunLeaderByEmail('tigerwolves', 'whoever@example.com')).error).toBe('Unauthorized')
      expect((await saveRunProfile({ kind: 'Workout', workoutTypes: ['Hills'] })).error).toBe('Unauthorized')
      expect((await saveRunCycle({ cycleMode: 'week_of_month', cycle: { '1': 'Hills' } })).error).toBe('Unauthorized')
    })
  })
})

// saveRunProfile writes the caller's own runs.kind / runs.workout_types (#321).
// The role gate short-circuits before any DB access, so the Unauthorized case runs
// without a staging DB; persistence is proven against staging like its siblings.
describe('saveRunProfile authorization', () => {
  test('returns Unauthorized when caller is not a leader', async () => {
    signInAs('user_notaleader_321', 'member')
    const res = await saveRunProfile({ kind: 'Workout', workoutTypes: ['Hills'] })
    expect(res.error).toBe('Unauthorized')
  })
})

describe.skipIf(!onStaging)('saveRunProfile persists to the caller’s own run', () => {
  // Provision a dedicated run + leader so this suite never mutates a shared fixture
  // row. tigerwolves' kind/workout_types are read and asserted on by db.test.ts's
  // #318 suite; since vitest runs test files in parallel, writing them here would
  // race that read. saveRunProfile always targets the caller's own run, so an
  // isolated run + leader keeps the write fully contained (mirrors the remove suite).
  const RUN = 'test-profile-321'
  const PROF_LEADER = 'user_proftest_A_321' // leads RUN
  const PROF_NAME = 'ProfTest LeaderA 321'

  beforeAll(async () => {
    await sql`INSERT INTO runs (id, name) VALUES (${RUN}, 'Profile Test 321') ON CONFLICT (id) DO NOTHING`
    await sql`DELETE FROM run_leaders WHERE run_id = ${RUN}`
    await sql`
      INSERT INTO run_leaders (run_id, name, clerk_user_id, sort_order, active)
      VALUES (${RUN}, ${PROF_NAME}, ${PROF_LEADER}, 1, true)
    `
    signInAs(PROF_LEADER)
  })

  afterAll(async () => {
    await sql`DELETE FROM run_leaders WHERE run_id = ${RUN}`
    await sql`DELETE FROM runs WHERE id = ${RUN}`
  })

  test('persists kind + workout_types to the caller’s run', async () => {
    const res = await saveRunProfile({ kind: 'Workout', workoutTypes: ['Hills', 'Threshold'] })
    expect(res.error).toBeUndefined()
    const row = await sql`SELECT kind, workout_types FROM runs WHERE id = ${RUN}`
    expect(row[0].kind).toBe('Workout')
    expect(row[0].workout_types).toEqual(['Hills', 'Threshold'])
  })

  test('drops workout types outside WORKOUT_TYPE_OPTIONS', async () => {
    const res = await saveRunProfile({ kind: 'Workout', workoutTypes: ['Hills', 'NotARealType'] })
    expect(res.error).toBeUndefined()
    const row = await sql`SELECT workout_types FROM runs WHERE id = ${RUN}`
    expect(row[0].workout_types).toEqual(['Hills'])
  })
})

// saveRunCycle writes the caller's own runs.cycle_mode / runs.cycle (#323). Like
// saveRunProfile, the role gate short-circuits before any DB access, so the
// Unauthorized case runs without a staging DB.
describe('saveRunCycle authorization', () => {
  test('returns Unauthorized when caller is not a leader', async () => {
    signInAs('user_notaleader_323', 'member')
    const res = await saveRunCycle({ cycleMode: 'week_of_month', cycle: { '1': 'Hills' } })
    expect(res.error).toBe('Unauthorized')
  })
})

describe.skipIf(!onStaging)('saveRunCycle persists to the caller’s own run', () => {
  // Dedicated run + leader with a known allowlist, so the allowlist-drop assertion
  // is meaningful and the write never touches a shared fixture row.
  const RUN = 'test-cycle-323'
  const CYC_LEADER = 'user_cyctest_A_323'
  const CYC_NAME = 'CycleTest LeaderA 323'

  beforeAll(async () => {
    await sql`INSERT INTO runs (id, name) VALUES (${RUN}, 'Cycle Test 323') ON CONFLICT (id) DO NOTHING`
    // A restricted allowlist: Hills, Ladder, Superset are allowed; everything else is not.
    await sql`UPDATE runs SET workout_types = ${['Hills', 'Ladder', 'Superset']}::text[] WHERE id = ${RUN}`
    await sql`DELETE FROM run_leaders WHERE run_id = ${RUN}`
    await sql`
      INSERT INTO run_leaders (run_id, name, clerk_user_id, sort_order, active)
      VALUES (${RUN}, ${CYC_NAME}, ${CYC_LEADER}, 1, true)
    `
    signInAs(CYC_LEADER)
  })

  afterAll(async () => {
    await sql`DELETE FROM run_leaders WHERE run_id = ${RUN}`
    await sql`DELETE FROM runs WHERE id = ${RUN}`
  })

  test('persists cycle_mode + cycle to the caller’s run', async () => {
    const res = await saveRunCycle({
      cycleMode: 'week_of_month',
      cycle: { '1': 'Hills', '4': 'Ladder or Superset' },
    })
    expect(res.error).toBeUndefined()
    const row = await sql`SELECT cycle_mode, cycle FROM runs WHERE id = ${RUN}`
    expect(row[0].cycle_mode).toBe('week_of_month')
    expect(row[0].cycle).toEqual({ '1': 'Hills', '4': 'Ladder or Superset' })
  })

  test('drops slot values outside the run’s allowlist', async () => {
    const res = await saveRunCycle({
      cycleMode: 'week_of_month',
      // Threshold is not in this run's allowlist; the compound slot keeps only Ladder.
      cycle: { '1': 'Threshold', '2': 'Ladder or Threshold' },
    })
    expect(res.error).toBeUndefined()
    const row = await sql`SELECT cycle FROM runs WHERE id = ${RUN}`
    // Slot 1 becomes empty (dropped entirely), slot 2 keeps only the allowed part.
    expect(row[0].cycle).toEqual({ '2': 'Ladder' })
  })

  test('cycleMode none clears the cycle map', async () => {
    const res = await saveRunCycle({ cycleMode: 'none', cycle: { '1': 'Hills' } })
    expect(res.error).toBeUndefined()
    const row = await sql`SELECT cycle_mode, cycle FROM runs WHERE id = ${RUN}`
    expect(row[0].cycle_mode).toBe('none')
    expect(row[0].cycle).toEqual({})
  })

  test('rejects an unknown cycle mode', async () => {
    const res = await saveRunCycle({ cycleMode: 'bogus', cycle: {} })
    expect(res.error).toBe('Invalid cycle mode')
  })
})

describe.skipIf(!onStaging)('removing a leader reassigns their future weeks', () => {
  const RUN = 'test-remove-310'
  const CALLER = 'user_remtest_A_310' // RemA, leads RUN — the caller
  const FUTURE = '2099-06-16'
  let remCId: number

  beforeAll(async () => {
    await sql`INSERT INTO runs (id, name) VALUES (${RUN}, 'Remove Test 310') ON CONFLICT (id) DO NOTHING`
    await sql`DELETE FROM schedule WHERE run_id = ${RUN}`
    await sql`DELETE FROM run_leaders WHERE run_id = ${RUN}`
    await sql`
      INSERT INTO run_leaders (run_id, name, clerk_user_id, sort_order, active) VALUES
        (${RUN}, 'RemA', ${CALLER}, 1, true),
        (${RUN}, 'RemB', NULL, 2, true)
    `
    const c = await sql`
      INSERT INTO run_leaders (run_id, name, sort_order, active)
      VALUES (${RUN}, 'RemC', 3, true) RETURNING id
    `
    remCId = c[0].id
    // A future week led by the leader we're about to remove.
    await sql`
      INSERT INTO schedule (date, run_id, workout_type, leader)
      VALUES (${FUTURE}::date, ${RUN}, '', 'RemC')
    `
  })

  afterAll(async () => {
    await sql`DELETE FROM schedule WHERE run_id = ${RUN}`
    await sql`DELETE FROM run_leaders WHERE run_id = ${RUN}`
    await sql`DELETE FROM runs WHERE id = ${RUN}`
  })

  test('future week is reassigned to another active leader; removed leader is deactivated', async () => {
    signInAs(CALLER)
    const res = await removeRunLeader(remCId)
    expect(res.error).toBeUndefined()
    expect(res.reassignedCount).toBe(1)
    expect(res.noLeaderDates).toEqual([])

    const sched = await sql`SELECT leader, needs_leader FROM schedule WHERE run_id=${RUN} AND date=${FUTURE}::date`
    const leader = sched[0].leader
    expect(leader).not.toBe('RemC')
    expect(['RemA', 'RemB']).toContain(leader)
    expect(sched[0].needs_leader).not.toBe(true)

    const removed = await sql`SELECT active FROM run_leaders WHERE id=${remCId}`
    expect(removed[0].active).toBe(false)
  })
})
