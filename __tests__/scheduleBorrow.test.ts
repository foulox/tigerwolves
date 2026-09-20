import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest'

// #405: one-time cross-run borrow — scheduling ANY run's workout from the Schedule
// "All runs" picker writes a schedule row only, with NO run_workouts membership (so
// the borrow never joins the run's library or its recency/rotation recommendations).
// This exercises the save action end-to-end: setPlanWorkout resolves the caller's run
// server-side and writes workout_name by string, with no membership side effect.
//
// Mocks mirror adoptRoute.test.ts: currentUser is Clerk server context; updateTag +
// revalidatePath both throw outside a real request scope (revalidateAll calls both),
// so both are stubbed. DB is real test-data — the test provisions its own group/run/
// family and cleans up, never touching shared fixtures.
vi.mock('@clerk/nextjs/server', () => ({ currentUser: vi.fn(), clerkClient: vi.fn() }))
vi.mock('next/cache', async importOriginal => {
  const actual = await importOriginal<typeof import('next/cache')>()
  return { ...actual, updateTag: vi.fn(), revalidatePath: vi.fn() }
})
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))

import { currentUser } from '@clerk/nextjs/server'
import { sql, getRunLibraryFamilyIds, dbAdoptRoute } from '../lib/db'
import { setPlanWorkout } from '../app/actions'

const TEST_DATA_HOST = 'ep-fragrant-sunset-atmdps9n-pooler.c-9.us-east-1.aws.neon.tech'
const onTestData = (process.env.DATABASE_URL ?? '').includes(TEST_DATA_HOST)

function signInAs(clerkId: string, role: 'leader' | null = 'leader') {
  vi.mocked(currentUser).mockResolvedValue({ id: clerkId, publicMetadata: role ? { role } : {} } as never)
}

describe.skipIf(!onTestData)('one-time cross-run borrow (AC5/AC7)', () => {
  const GROUP_MINE = 'Borrow Test Mine 405'
  const GROUP_OTHER = 'Borrow Test Other 405'
  const RUN = 'test-borrow-405'
  const LEADER = 'user_borrow_leader_405'
  const BORROW_NAME = 'Borrowed Off-Type Route 405'
  const OWNED_NAME = 'Owned Route 405'
  let myGroupId: number
  let otherGroupId: number
  let borrowFamilyId: number
  let ownedFamilyId: number
  let scheduleDate: string

  async function ensureGroup(name: string): Promise<number> {
    const existing = await sql`SELECT id FROM run_groups WHERE name = ${name}`
    return existing.length > 0
      ? (existing[0].id as number)
      : ((await sql`INSERT INTO run_groups (name, venue, default_location) VALUES (${name}, 'road', 'Test') RETURNING id`)[0].id as number)
  }

  beforeAll(async () => {
    myGroupId = await ensureGroup(GROUP_MINE)
    otherGroupId = await ensureGroup(GROUP_OTHER)

    // My run (reconciled to its own group), led by LEADER.
    await sql`INSERT INTO runs (id, name, run_group_id) VALUES (${RUN}, 'Borrow Run', ${myGroupId})
      ON CONFLICT (id) DO UPDATE SET run_group_id = EXCLUDED.run_group_id`
    await sql`DELETE FROM run_leaders WHERE clerk_user_id = ${LEADER}`
    await sql`INSERT INTO run_leaders (run_id, name, clerk_user_id, sort_order, active)
      VALUES (${RUN}, 'Borrow Leader', ${LEADER}, 1, true)`

    // A route my run OWNS (in its library) + a route ANOTHER run owns (a borrow candidate,
    // never adopted by my run).
    const [owned] = await sql`INSERT INTO workout_families (name, category, type, reason, author, run_group_id)
      VALUES (${OWNED_NAME}, 'Quality', 'Hills', 'test', 'mine', ${myGroupId}) RETURNING id`
    ownedFamilyId = owned.id as number
    const [borrow] = await sql`INSERT INTO workout_families (name, category, type, reason, author, run_group_id)
      VALUES (${BORROW_NAME}, 'Easy', 'Easy', 'test', 'other', ${otherGroupId}) RETURNING id`
    borrowFamilyId = borrow.id as number
    for (const fid of [ownedFamilyId, borrowFamilyId]) {
      await sql`INSERT INTO workout_variants (family_id, label, sort_order, raw_input, has_turnaround, turnaround, flagged, flag_note)
        VALUES (${fid}, NULL, NULL, 'route', false, '', false, '')`
    }
    // My library = the owned route only. The borrow candidate is deliberately NOT adopted.
    await sql`DELETE FROM run_workouts WHERE run_id = ${RUN}`
    await dbAdoptRoute(RUN, ownedFamilyId)

    // A schedule row for my run to plan into. Date is far future to avoid colliding
    // with fixture rows; workout_name starts NULL (unplanned).
    scheduleDate = '2099-06-02'
    await sql`DELETE FROM schedule WHERE date = ${scheduleDate}::date AND run_id = ${RUN}`
    await sql`INSERT INTO schedule (date, run_id, workout_type, leader, workout_name)
      VALUES (${scheduleDate}::date, ${RUN}, 'Easy', 'Borrow Leader', NULL)`
  })

  afterAll(async () => {
    await sql`DELETE FROM schedule WHERE date = ${scheduleDate}::date AND run_id = ${RUN}`
    await sql`DELETE FROM run_workouts WHERE run_id = ${RUN}`
    await sql`DELETE FROM run_leaders WHERE clerk_user_id = ${LEADER}`
    await sql`DELETE FROM workout_variants WHERE family_id IN (${ownedFamilyId}, ${borrowFamilyId})`
    await sql`DELETE FROM workout_families WHERE id IN (${ownedFamilyId}, ${borrowFamilyId})`
    await sql`DELETE FROM runs WHERE id = ${RUN}`
    await sql`DELETE FROM run_groups WHERE id IN (${myGroupId}, ${otherGroupId})`
  })

  test('borrowing another run\'s workout writes the schedule row but NO run_workouts membership', async () => {
    signInAs(LEADER)
    const libBefore = (await getRunLibraryFamilyIds(RUN)).sort()

    await setPlanWorkout(scheduleDate, BORROW_NAME, [''])

    // The schedule row now references the borrowed workout by name.
    const [row] = await sql`SELECT workout_name FROM schedule WHERE date = ${scheduleDate}::date AND run_id = ${RUN}`
    expect(row.workout_name).toBe(BORROW_NAME)

    // No membership row was created for the borrowed family (AC5).
    const membership = await sql`SELECT 1 FROM run_workouts WHERE run_id = ${RUN} AND family_id = ${borrowFamilyId}`
    expect(membership.length).toBe(0)

    // The run's library is byte-for-byte unchanged — the borrow did not join it, so it
    // cannot enter recency/rotation recs, which are library-scoped (AC7).
    const libAfter = (await getRunLibraryFamilyIds(RUN)).sort()
    expect(libAfter).toEqual(libBefore)
    expect(libAfter).not.toContain(borrowFamilyId)
    expect(libAfter).toContain(ownedFamilyId)
  })
})
