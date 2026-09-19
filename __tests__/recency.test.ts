import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { sql, fetchWorkoutVariants, dbSetScheduleWorkout, dbAdoptRoute } from '../lib/db'
import { schedulePickerSuggestions } from '../lib/schedulePicker'
import type { WorkoutVariantRow } from '../lib/data'

// #402: per-run last-run recency on the run_workouts junction. Staging-only for the DB
// tests (they write) — same guard as db.test.ts/adoptRoute.test.ts. The pure sort test
// runs anywhere. Fixtures are fully self-provisioned + torn down; they never touch shared
// rows. Yesterday/today/tomorrow are computed once so the ≤-today cutoff is deterministic.
const STAGING_HOST = 'ep-fragrant-sunset-atmdps9n-pooler.c-9.us-east-1.aws.neon.tech'
const onStaging = (process.env.DATABASE_URL ?? '').includes(STAGING_HOST)

// ── AC5: recency sort (pure — runs without a DB) ──────────────────────────────
describe('recency sort orders stalest-first, "Never" (null) on top (AC5)', () => {
  const base: WorkoutVariantRow = {
    id: 0, familyId: 0, name: '', label: null, sortOrder: null, category: 'Tempo',
    type: 'Straight Tempo', reason: '', rawInput: '', distTime: '', energySystem: '',
    hrZone: '', rpe: '', coachingNotes: null, mapLink: null, author: null, raceTypes: [],
    trainingPhases: [], hasTurnaround: false, turnaround: '', flagged: false, flagNote: '',
    runGroupId: null, lastRan: null,
  }
  const mk = (id: number, lastRan: string | null): WorkoutVariantRow =>
    ({ ...base, id, name: `W${id}`, lastRan })

  test('null sorts before any date; older dates before newer', () => {
    const recent = mk(1, '2026-09-15')
    const old = mk(2, '2026-01-01')
    const never = mk(3, null)
    const sorted = schedulePickerSuggestions({
      showAllRuns: true,
      ownVariants: [],
      allVariants: [recent, old, never],
      isWorkout: true,
      runCategory: null,
      weekTypes: [],
      browseCategory: null,
      browseType: null,
      plannedId: null,
    })
    // stalest-first: Never (null) → oldest date → most recent.
    expect(sorted.map(w => w.id)).toEqual([3, 2, 1])
  })
})

// ── AC2 / AC3 / AC4 / AC6: per-run recency on the junction (staging) ───────────
describe.skipIf(!onStaging)('per-run last_ran on run_workouts (AC2/AC3/AC4/AC6)', () => {
  const GROUP = 'Recency Test 402'
  const RUN_A = 'test-recency-402-a'
  const RUN_B = 'test-recency-402-b'
  let groupId: number
  let familyId: number
  let familyName: string

  // Dates relative to today so the ≤-CURRENT_DATE cutoff is exercised for real.
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const today = new Date()
  const yesterday = iso(new Date(today.getTime() - 86400_000))
  const lastWeek = iso(new Date(today.getTime() - 7 * 86400_000))
  const tomorrow = iso(new Date(today.getTime() + 86400_000))

  beforeAll(async () => {
    const existing = await sql`SELECT id FROM run_groups WHERE name = ${GROUP}`
    groupId = existing.length > 0
      ? (existing[0].id as number)
      : ((await sql`
          INSERT INTO run_groups (name, venue, default_location) VALUES (${GROUP}, 'road', 'Test')
          RETURNING id
        `)[0].id as number)
    familyName = 'Recency Fixture Route'
    const [f] = await sql`
      INSERT INTO workout_families (name, category, type, reason, author, run_group_id)
      VALUES (${familyName}, 'Tempo', 'Straight Tempo', 'test', ${GROUP}, ${groupId})
      RETURNING id
    `
    familyId = f.id as number
    await sql`
      INSERT INTO workout_variants (family_id, label, sort_order, raw_input, has_turnaround, turnaround, flagged, flag_note)
      VALUES (${familyId}, NULL, NULL, 'test route', false, '', false, '')
    `
    // RUN_A is reconciled to the group (so the scoped read returns the family);
    // RUN_B is a separate run that ADOPTS the same shared route.
    await sql`INSERT INTO runs (id, name, run_group_id) VALUES (${RUN_A}, 'Recency Run A', ${groupId}) ON CONFLICT (id) DO NOTHING`
    await sql`INSERT INTO runs (id, name) VALUES (${RUN_B}, 'Recency Run B') ON CONFLICT (id) DO NOTHING`
    await sql`DELETE FROM run_workouts WHERE run_id IN (${RUN_A}, ${RUN_B})`
    await sql`DELETE FROM schedule WHERE run_id IN (${RUN_A}, ${RUN_B})`
  })

  afterAll(async () => {
    await sql`DELETE FROM run_workouts WHERE run_id IN (${RUN_A}, ${RUN_B})`
    await sql`DELETE FROM schedule WHERE run_id IN (${RUN_A}, ${RUN_B})`
    await sql`DELETE FROM workout_variants WHERE family_id = ${familyId}`
    await sql`DELETE FROM workout_families WHERE id = ${familyId}`
    await sql`DELETE FROM runs WHERE id IN (${RUN_A}, ${RUN_B})`
    await sql`DELETE FROM run_groups WHERE id = ${groupId}`
  })

  test('a shared route reads a DIFFERENT last_ran per viewing run (AC2/AC6)', async () => {
    // Both runs are members of the one family, with different recency dates.
    await dbAdoptRoute(RUN_A, familyId)
    await dbAdoptRoute(RUN_B, familyId)
    await sql`UPDATE run_workouts SET last_ran = ${yesterday}::date WHERE run_id = ${RUN_A} AND family_id = ${familyId}`
    await sql`UPDATE run_workouts SET last_ran = ${lastWeek}::date WHERE run_id = ${RUN_B} AND family_id = ${familyId}`

    // Scoped read for RUN_A (its group) → RUN_A's own recency (AC2).
    const scopedA = (await fetchWorkoutVariants(RUN_A)).find(w => w.familyId === familyId)
    expect(scopedA?.lastRan).toBe(yesterday)

    // "All runs" full catalog, viewer = RUN_A vs RUN_B → each sees its own date (AC6).
    const catalogAsA = (await fetchWorkoutVariants(undefined, RUN_A)).find(w => w.familyId === familyId)
    const catalogAsB = (await fetchWorkoutVariants(undefined, RUN_B)).find(w => w.familyId === familyId)
    expect(catalogAsA?.lastRan).toBe(yesterday)
    expect(catalogAsB?.lastRan).toBe(lastWeek)

    // No recency run given → null ("Never"), the pre-#402 behavior.
    const catalogNoViewer = (await fetchWorkoutVariants()).find(w => w.familyId === familyId)
    expect(catalogNoViewer?.lastRan).toBeNull()
  })

  test('scheduling a member route on a past/today date sets last_ran; GREATEST never regresses (AC3)', async () => {
    await dbAdoptRoute(RUN_A, familyId)
    await sql`UPDATE run_workouts SET last_ran = NULL WHERE run_id = ${RUN_A} AND family_id = ${familyId}`

    // First scheduling sets it from NULL.
    await dbSetScheduleWorkout(lastWeek, RUN_A, familyName, [''])
    let [row] = await sql`SELECT last_ran FROM run_workouts WHERE run_id = ${RUN_A} AND family_id = ${familyId}`
    expect(row.last_ran).not.toBeNull()

    // A NEWER date advances it.
    await dbSetScheduleWorkout(yesterday, RUN_A, familyName, [''])
    ;[row] = await sql`SELECT to_char(last_ran, 'YYYY-MM-DD') AS d FROM run_workouts WHERE run_id = ${RUN_A} AND family_id = ${familyId}`
    expect(row.d).toBe(yesterday)

    // Re-scheduling onto an OLDER date must not regress the newer recency (GREATEST).
    await dbSetScheduleWorkout(lastWeek, RUN_A, familyName, [''])
    ;[row] = await sql`SELECT to_char(last_ran, 'YYYY-MM-DD') AS d FROM run_workouts WHERE run_id = ${RUN_A} AND family_id = ${familyId}`
    expect(row.d).toBe(yesterday)

    // A FUTURE date does not touch recency (not run yet).
    await dbSetScheduleWorkout(tomorrow, RUN_A, familyName, [''])
    ;[row] = await sql`SELECT to_char(last_ran, 'YYYY-MM-DD') AS d FROM run_workouts WHERE run_id = ${RUN_A} AND family_id = ${familyId}`
    expect(row.d).toBe(yesterday)
  })

  test('scheduling a NON-member route (borrow, #405) creates no membership row (AC3 guard)', async () => {
    // RUN_B has no membership for this family; a one-time borrow must not adopt it.
    await sql`DELETE FROM run_workouts WHERE run_id = ${RUN_B} AND family_id = ${familyId}`
    await dbSetScheduleWorkout(yesterday, RUN_B, familyName, [''])
    const rows = await sql`SELECT 1 FROM run_workouts WHERE run_id = ${RUN_B} AND family_id = ${familyId}`
    expect(rows.length).toBe(0)
  })

  test('backfill derives last_ran = MAX(past/today schedule date) per run, matched by name (AC4)', async () => {
    await dbAdoptRoute(RUN_A, familyId)
    await sql`UPDATE run_workouts SET last_ran = NULL WHERE run_id = ${RUN_A} AND family_id = ${familyId}`
    await sql`DELETE FROM schedule WHERE run_id = ${RUN_A}`
    // History: two past dates + one future. Backfill should pick the latest PAST one.
    await sql`INSERT INTO schedule (date, run_id, workout_type, leader, workout_name) VALUES (${lastWeek}::date, ${RUN_A}, 'Straight Tempo', 'x', ${familyName})`
    await sql`INSERT INTO schedule (date, run_id, workout_type, leader, workout_name) VALUES (${yesterday}::date, ${RUN_A}, 'Straight Tempo', 'x', ${familyName})`
    await sql`INSERT INTO schedule (date, run_id, workout_type, leader, workout_name) VALUES (${tomorrow}::date, ${RUN_A}, 'Straight Tempo', 'x', ${familyName})`

    // The exact backfill statement from scripts/migrate-402.sql, scoped to the test run
    // so it never touches shared rows. Kept identical so this asserts the shipped logic.
    await sql`
      UPDATE run_workouts rw
      SET last_ran = sub.max_date
      FROM (
        SELECT m.run_id, m.family_id, MAX(s.date) AS max_date
        FROM run_workouts m
        JOIN workout_families wf ON wf.id = m.family_id
        JOIN schedule s ON s.run_id = m.run_id
                       AND s.workout_name = wf.name
                       AND s.workout_name IS NOT NULL
                       AND s.workout_name <> ''
                       AND s.date <= CURRENT_DATE
        WHERE m.run_id = ${RUN_A}
        GROUP BY m.run_id, m.family_id
      ) sub
      WHERE rw.run_id = sub.run_id AND rw.family_id = sub.family_id
    `
    const [row] = await sql`SELECT to_char(last_ran, 'YYYY-MM-DD') AS d FROM run_workouts WHERE run_id = ${RUN_A} AND family_id = ${familyId}`
    expect(row.d).toBe(yesterday) // latest past date, not the future one
  })
})
