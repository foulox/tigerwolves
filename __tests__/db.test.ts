import { describe, it, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import {
  sql, fetchSchedule, fetchRaces, fetchRunGroups, dbSetScheduleWorkout,
  dbInsertWorkoutVariant, dbUpdateWorkoutVariant, WorkoutVariantNotFoundError,
  dbAddWorkoutVariant, dbDeleteWorkoutVariant, dbFlagWorkoutVariant,
  dbFixWorkoutVariantAndClearFlag, dbRegroupVariants,
  getLeaderRun, getRunRoster, fetchWorkoutVariants, generateScheduleHorizon,
} from '../lib/db'
import { resolveWorkoutType } from '../lib/cycle'

// Tests that depend on the e2e seed data (fetchSchedule/fetchRaces/dbSetScheduleWorkout),
// or that WRITE, only run against the staging branch — never a fresh local DB (where the
// e2e seed hasn't run) or production. Module-scoped so every describe.skipIf below sees it.
const STAGING_HOST = 'ep-fragrant-sunset-atmdps9n-pooler.c-9.us-east-1.aws.neon.tech'
const onStaging = (process.env.DATABASE_URL ?? '').includes(STAGING_HOST)

describe('database connection and schema', () => {
  it('connects to the database', async () => {
    const result = await sql`SELECT 1 AS ok`
    expect(result[0].ok).toBe(1)
  })

  // #278: `workouts` was renamed to `workouts_legacy` as a rollback net once
  // every read/write path moved to workout_families/workout_variants — this
  // just confirms the rename preserved the table and its data, not a hardcoded
  // row count (incidental to what the rename is meant to prove). The non-empty
  // assertion relies on this DB already having pre-#278 `workouts` data — true
  // for every real database this migration will ever run against, since Neon's
  // Preview/staging/production branches are always forks of a parent branch
  // that already has it (CLAUDE.md), never a from-scratch empty schema.
  it('workouts_legacy exists and retains its data after the #278 rename', async () => {
    const rows = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'workouts_legacy'
      ORDER BY column_name
    `
    const cols = rows.map((r) => r.column_name as string)
    expect(cols).toContain('id')
    expect(cols).toContain('name')
    expect(cols).toContain('variation')

    const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM workouts_legacy`
    expect(count as number).toBeGreaterThan(0)
  })

  it('schedule table has expected columns including selected_variations', async () => {
    const rows = await sql`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'schedule'
    `
    const cols = rows.map((r) => r.column_name as string)
    expect(cols).toContain('date')
    expect(cols).toContain('workout_name')
    expect(cols).toContain('selected_variations')
  })

  it('races table exists with id, organizer, verified, flagged, flag_note columns', async () => {
    const rows = await sql`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'races'
    `
    const cols = rows.map((r) => r.column_name as string)
    expect(cols.length).toBeGreaterThan(0)
    expect(cols).toContain('id')
    expect(cols).toContain('organizer')
    expect(cols).toContain('verified')
    expect(cols).toContain('flagged')
    expect(cols).toContain('flag_note')
  })

  it('run_leaders table exists', async () => {
    const rows = await sql`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'run_leaders'
    `
    expect(rows.length).toBeGreaterThan(0)
  })
})

describe.skipIf(!onStaging)('fetchSchedule', () => {
  it('returns schedule entries with date and weekOfMonth', async () => {
    const entries = await fetchSchedule()
    expect(Array.isArray(entries)).toBe(true)
    expect(entries.length).toBeGreaterThan(0)
    const e = entries[0]
    expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(e.weekOfMonth).toBeGreaterThanOrEqual(1)
    expect(e.weekOfMonth).toBeLessThanOrEqual(5)
    expect(typeof e.leader).toBe('string')
    expect(typeof e.workoutType).toBe('string')
  })
})

describe.skipIf(!onStaging)('fetchRaces', () => {
  it('returns race entries with expected shape', async () => {
    const races = await fetchRaces()
    expect(Array.isArray(races)).toBe(true)
    expect(races.length).toBeGreaterThan(0)
    const r = races[0]
    expect(typeof r.id).toBe('number')
    expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(typeof r.name).toBe('string')
    expect(typeof r.distance).toBe('string')
    expect(typeof r.organizer).toBe('string')
    expect(typeof r.verified).toBe('boolean')
    expect(typeof r.flagged).toBe('boolean')
    expect(typeof r.flagNote).toBe('string')
  })
})

describe.skipIf(!onStaging)('dbSetScheduleWorkout', () => {
  it('saves workout_name and a single variation (standalone)', async () => {
    const rows = await fetchSchedule()
    expect(rows.length).toBeGreaterThan(0)
    const target = rows[0]
    const originalName = target.workoutName
    const originalVariations = target.selectedVariations

    try {
      await dbSetScheduleWorkout(target.date, 'tigerwolves', '__test_plan__', [''])
      const updated = await fetchSchedule()
      const row = updated.find(e => e.date === target.date)
      expect(row?.workoutName).toBe('__test_plan__')
      expect(row?.selectedVariations).toEqual([''])
    } finally {
      await sql`UPDATE schedule SET workout_name = ${originalName}, selected_variations = ${originalVariations} WHERE date = ${target.date}::date AND run_id = 'tigerwolves'`
    }
  })

  it('saves two variations when Standard + Longer are both selected', async () => {
    const rows = await fetchSchedule()
    expect(rows.length).toBeGreaterThan(0)
    const target = rows[0]
    const originalName = target.workoutName
    const originalVariations = target.selectedVariations

    try {
      await dbSetScheduleWorkout(target.date, 'tigerwolves', '__test_family__', ['', 'Longer — 6×4min @ LT'])
      const updated = await fetchSchedule()
      const row = updated.find(e => e.date === target.date)
      expect(row?.workoutName).toBe('__test_family__')
      expect(row?.selectedVariations).toEqual(['', 'Longer — 6×4min @ LT'])
    } finally {
      await sql`UPDATE schedule SET workout_name = ${originalName}, selected_variations = ${originalVariations} WHERE date = ${target.date}::date AND run_id = 'tigerwolves'`
    }
  })

  it('overwrites to a single variation after previously saving two', async () => {
    const rows = await fetchSchedule()
    expect(rows.length).toBeGreaterThan(0)
    const target = rows[0]
    const originalName = target.workoutName
    const originalVariations = target.selectedVariations

    try {
      await dbSetScheduleWorkout(target.date, 'tigerwolves', '__test_family__', ['', 'Longer'])
      await dbSetScheduleWorkout(target.date, 'tigerwolves', '__test_standalone__', [''])
      const updated = await fetchSchedule()
      const row = updated.find(e => e.date === target.date)
      expect(row?.selectedVariations).toEqual([''])
    } finally {
      await sql`UPDATE schedule SET workout_name = ${originalName}, selected_variations = ${originalVariations} WHERE date = ${target.date}::date AND run_id = 'tigerwolves'`
    }
  })
})

describe('fetchRunGroups', () => {
  it('returns an array of run groups with the expected shape', async () => {
    const groups = await fetchRunGroups()
    expect(Array.isArray(groups)).toBe(true)
    for (const g of groups) {
      expect(typeof g.id).toBe('number')
      expect(typeof g.name).toBe('string')
      expect(typeof g.venue).toBe('string')
    }
  })
})

describe('workout_families / workout_variants write path (#274)', () => {
  const TEST_NAME = '__test_family_274__'
  let familyId: number
  let variantId: number

  const BASE_INPUT = {
    name: TEST_NAME,
    category: 'Quality' as const,
    type: 'Hills' as const,
    reason: 'Test reason',
    author: 'Test',
    coachingNotes: 'Push the pace',
    mapLink: null,
    runGroupId: null,
    instructions: 'WU: 10 min easy. Main: 5x2min hill. CD: 10 min easy.',
    distTime: '30min',
    energySystem: 'Anaerobic',
    hrZone: 'Z4-Z5',
    rpe: '8',
    raceTypes: ['5K'],
    trainingPhases: ['Build'],
    hasTurnaround: true,
    turnaround: 'After the 3rd rep',
    label: null,
    sortOrder: null,
  }

  afterAll(async () => {
    if (variantId) await sql`DELETE FROM workout_variants WHERE id = ${variantId}`
    if (familyId) await sql`DELETE FROM workout_families WHERE id = ${familyId}`
  })

  it('inserts a workout family + variant via dbInsertWorkoutVariant and reads both back', async () => {
    const result = await dbInsertWorkoutVariant(BASE_INPUT)
    familyId = result.familyId
    variantId = result.variantId

    const [family] = await sql`SELECT * FROM workout_families WHERE id = ${familyId}`
    expect(family.name).toBe(TEST_NAME)
    expect(family.category).toBe('Quality')
    expect(family.type).toBe('Hills')

    const [variant] = await sql`SELECT * FROM workout_variants WHERE id = ${variantId}`
    expect(variant.family_id).toBe(familyId)
    expect(variant.label).toBeNull()
    expect(variant.raw_input).toBe(BASE_INPUT.instructions)
    expect(variant.has_turnaround).toBe(true)
    expect(variant.turnaround).toBe('After the 3rd rep')
    expect(variant.race_types).toEqual(['5K'])
  })

  it('updates the family + variant via dbUpdateWorkoutVariant, including label/sortOrder (#277)', async () => {
    await dbUpdateWorkoutVariant(variantId, {
      ...BASE_INPUT,
      category: 'Long',
      reason: 'Updated reason',
      instructions: 'Updated instructions',
      hasTurnaround: false,
      turnaround: '',
      label: 'Renamed variation',
      sortOrder: 3,
    })

    const [family] = await sql`SELECT * FROM workout_families WHERE id = ${familyId}`
    expect(family.category).toBe('Long')
    expect(family.reason).toBe('Updated reason')

    const [variant] = await sql`SELECT * FROM workout_variants WHERE id = ${variantId}`
    expect(variant.raw_input).toBe('Updated instructions')
    expect(variant.has_turnaround).toBe(false)
    expect(variant.label).toBe('Renamed variation')
    expect(variant.sort_order).toBe(3)

    // Restore to a null-label singleton so later tests in this file (which
    // assume BASE_INPUT's original shape) aren't affected by this rename.
    await dbUpdateWorkoutVariant(variantId, BASE_INPUT)
  })

  it('dbUpdateWorkoutVariant throws WorkoutVariantNotFoundError for an unknown id', async () => {
    await expect(dbUpdateWorkoutVariant(-1, BASE_INPUT)).rejects.toThrow(WorkoutVariantNotFoundError)
  })
})

describe('workout_variants write path additions (#277)', () => {
  const FAMILY_NAME = '__test_family_277__'
  let familyId: number
  let baseVariantId: number

  const BASE_INPUT = {
    name: FAMILY_NAME,
    category: 'Quality' as const,
    type: 'Hills' as const,
    reason: 'Test reason',
    author: 'Test',
    coachingNotes: null,
    mapLink: null,
    runGroupId: null,
    instructions: 'WU: 10 min easy. Main: 5x2min hill. CD: 10 min easy.',
    distTime: '30min',
    energySystem: 'Anaerobic',
    hrZone: 'Z4-Z5',
    rpe: '8',
    raceTypes: ['5K'],
    trainingPhases: ['Build'],
    hasTurnaround: false,
    turnaround: '',
    label: null,
    sortOrder: null,
  }

  beforeEach(async () => {
    const result = await dbInsertWorkoutVariant(BASE_INPUT)
    familyId = result.familyId
    baseVariantId = result.variantId
  })

  afterEach(async () => {
    await sql`DELETE FROM workout_variants WHERE family_id = ${familyId}`
    await sql`DELETE FROM workout_families WHERE id = ${familyId}`
  })

  it('dbAddWorkoutVariant adds a variant to an existing family without creating a new one', async () => {
    const { variantId } = await dbAddWorkoutVariant(familyId, {
      label: 'Shorter version',
      sortOrder: 1,
      instructions: 'WU: 10 min easy. Main: 3x2min hill.',
      distTime: '20min',
      energySystem: 'Anaerobic',
      hrZone: 'Z4-Z5',
      rpe: '7',
      raceTypes: ['5K'],
      trainingPhases: ['Build'],
      hasTurnaround: false,
      turnaround: '',
    })

    const [variant] = await sql`SELECT * FROM workout_variants WHERE id = ${variantId}`
    expect(variant.family_id).toBe(familyId)
    expect(variant.label).toBe('Shorter version')
    expect(variant.sort_order).toBe(1)

    const families = await sql`SELECT id FROM workout_families WHERE id = ${familyId}`
    expect(families).toHaveLength(1)
  })

  it('dbFlagWorkoutVariant flags a variant', async () => {
    await dbFlagWorkoutVariant(baseVariantId, 'the distance looks wrong')
    const [variant] = await sql`SELECT flagged, flag_note FROM workout_variants WHERE id = ${baseVariantId}`
    expect(variant.flagged).toBe(true)
    expect(variant.flag_note).toBe('the distance looks wrong')
  })

  it('dbFlagWorkoutVariant throws WorkoutVariantNotFoundError for an unknown id', async () => {
    await expect(dbFlagWorkoutVariant(-1, 'note')).rejects.toThrow(WorkoutVariantNotFoundError)
  })

  it('dbFixWorkoutVariantAndClearFlag fixes and clears the flag', async () => {
    await dbFlagWorkoutVariant(baseVariantId, 'wrong distance')
    await dbFixWorkoutVariantAndClearFlag(baseVariantId, {
      reason: 'Fixed reason', distTime: '25min', instructions: 'Fixed instructions',
    })

    const [family] = await sql`SELECT reason FROM workout_families WHERE id = ${familyId}`
    expect(family.reason).toBe('Fixed reason')

    const [variant] = await sql`SELECT dist_time, raw_input, flagged, flag_note FROM workout_variants WHERE id = ${baseVariantId}`
    expect(variant.dist_time).toBe('25min')
    expect(variant.raw_input).toBe('Fixed instructions')
    expect(variant.flagged).toBe(false)
    expect(variant.flag_note).toBe('')
  })

  it('dbFixWorkoutVariantAndClearFlag throws WorkoutVariantNotFoundError for an unknown id', async () => {
    await expect(dbFixWorkoutVariantAndClearFlag(-1, {
      reason: 'x', distTime: 'x', instructions: 'x',
    })).rejects.toThrow(WorkoutVariantNotFoundError)
  })

  it('dbDeleteWorkoutVariant deletes a variant but keeps the family when other variants remain', async () => {
    const { variantId: secondVariantId } = await dbAddWorkoutVariant(familyId, {
      label: 'Second variant', sortOrder: 1,
      instructions: 'x', distTime: '', energySystem: '', hrZone: '', rpe: '',
      raceTypes: [], trainingPhases: [], hasTurnaround: false, turnaround: '',
    })

    await dbDeleteWorkoutVariant(secondVariantId)

    const remainingVariants = await sql`SELECT id FROM workout_variants WHERE family_id = ${familyId}`
    expect(remainingVariants).toHaveLength(1)
    const families = await sql`SELECT id FROM workout_families WHERE id = ${familyId}`
    expect(families).toHaveLength(1)
  })

  it('dbDeleteWorkoutVariant deletes the family too when it was the last variant', async () => {
    await dbDeleteWorkoutVariant(baseVariantId)

    const remainingVariants = await sql`SELECT id FROM workout_variants WHERE family_id = ${familyId}`
    expect(remainingVariants).toHaveLength(0)
    const families = await sql`SELECT id FROM workout_families WHERE id = ${familyId}`
    expect(families).toHaveLength(0)

    // afterEach's cleanup queries are harmless no-ops once the family is already gone.
  })

  it('dbDeleteWorkoutVariant throws WorkoutVariantNotFoundError for an unknown id', async () => {
    await expect(dbDeleteWorkoutVariant(-1)).rejects.toThrow(WorkoutVariantNotFoundError)
  })

  it('dbRegroupVariants merges variants from different families into one new family', async () => {
    const other = await dbInsertWorkoutVariant({ ...BASE_INPUT, name: '__test_family_277_other__' })

    await dbRegroupVariants('__test_regrouped_277__', [
      { variantId: baseVariantId, label: 'First', sortOrder: 1 },
      { variantId: other.variantId, label: 'Second', sortOrder: 2 },
    ])

    const [newFamily] = await sql`SELECT id, category, type FROM workout_families WHERE name = '__test_regrouped_277__'`
    expect(newFamily).toBeDefined()
    expect(newFamily.category).toBe('Quality')

    const variants = await sql`SELECT label, sort_order, family_id FROM workout_variants WHERE family_id = ${newFamily.id}`
    expect(variants).toHaveLength(2)
    expect(variants.map(v => v.label).sort()).toEqual(['First', 'Second'])

    // Both source families should be gone — each had exactly one variant, and both moved out.
    const sourceFamilies = await sql`SELECT id FROM workout_families WHERE id IN (${familyId}, ${other.familyId})`
    expect(sourceFamilies).toHaveLength(0)

    // Clean up the new family this test created (not covered by afterEach, which only
    // knows about the original familyId).
    await sql`DELETE FROM workout_variants WHERE family_id = ${newFamily.id}`
    await sql`DELETE FROM workout_families WHERE id = ${newFamily.id}`
  })
})

// These tests require the #310 migration (leader_intro on runs; away_periods/email
// on run_leaders) to have been applied to the staging branch. They self-seed their
// own run_leaders rows rather than depend on ambient staging state (which the e2e
// seed wipes and rewrites) or on a hand-maintained clerk-id secret matching a row.
// .env.local's DATABASE_URL points at during a local run. CI uses staging.

describe.skipIf(!onStaging)('getLeaderRun', () => {
  // A clerk id that only this test uses, linked to the real 'tigerwolves' run
  // (its runs row is created by scripts/migrate.sql and always present on staging).
  const TEST_CLERK_ID = 'user_dbtest310_getleaderrun'
  const TEST_NAME = 'DB Test — getLeaderRun 310'

  beforeAll(async () => {
    await sql`
      INSERT INTO run_leaders (run_id, name, clerk_user_id, sort_order, active)
      VALUES ('tigerwolves', ${TEST_NAME}, ${TEST_CLERK_ID}, 999, true)
      ON CONFLICT (run_id, name) DO UPDATE SET clerk_user_id = ${TEST_CLERK_ID}, active = true
    `
  })
  afterAll(async () => {
    await sql`DELETE FROM run_leaders WHERE run_id = 'tigerwolves' AND name = ${TEST_NAME}`
  })

  test('returns the run a leader is linked to via clerk_user_id', async () => {
    const run = await getLeaderRun(TEST_CLERK_ID)
    expect(run).not.toBeNull()
    expect(run?.id).toBe('tigerwolves')
    // leader_intro is a run-level, leader-editable field (the migration backfills
    // 'Run Leaders:' and getLeaderRun falls back to it when NULL, but a leader may
    // have since edited it — production reads "Your Favorite Run Leaders: (vote for
    // us)"). Assert it resolves to a non-empty string, not a specific literal this
    // test doesn't own.
    expect(typeof run?.leaderIntro).toBe('string')
    expect((run?.leaderIntro ?? '').length).toBeGreaterThan(0)
  })

  test('returns null for an unknown userId', async () => {
    const run = await getLeaderRun('user_nonexistent')
    expect(run).toBeNull()
  })
})

describe.skipIf(!onStaging)('getRunRoster', () => {
  // Fully isolated under a synthetic run_id (run_leaders has no FK to runs, so no
  // runs row is needed) — independent of the tigerwolves roster the e2e seed rewrites.
  const RID = 'test-run-310-getrunroster'

  beforeAll(async () => {
    await sql`DELETE FROM run_leaders WHERE run_id = ${RID}`
    await sql`
      INSERT INTO run_leaders (run_id, name, sort_order, active) VALUES
        (${RID}, 'Roster Test A', 1, true),
        (${RID}, 'Roster Test B', 2, true)
    `
  })
  afterAll(async () => {
    await sql`DELETE FROM run_leaders WHERE run_id = ${RID}`
  })

  test('returns leaders ordered by sort_order', async () => {
    const roster = await getRunRoster(RID)
    expect(roster.length).toBe(2)
    expect(roster[0].sortOrder).toBeLessThan(roster[1].sortOrder!)
    expect(roster[0].name).toBe('Roster Test A')
  })
})

// #318 per-run profile foundation: kind + workout-type allowlist columns on `runs`,
// and the run↔run_group reconciliation that lets fetchWorkoutVariants scope by a real
// FK (runs.run_group_id) instead of the fragile rg.name = runs.name string match.
// Guarded skipIf(!onStaging) for the same reason as the #310 tests above: these depend
// on the migration + TigerWolves seed, which are only guaranteed on staging (CI) — a
// local run points at un-migrated production (.env.local), where the new columns don't
// exist yet (production migration timing is Lou's call, not part of this story's gate).
describe.skipIf(!onStaging)('#318 per-run profile foundation', () => {
  const TW_TYPES = ['Hills', 'Broken Tempo', 'Progression', 'Ladder', 'Superset', 'Straight Tempo', 'Threshold']

  it('runs table has kind, workout_types, run_group_id columns', async () => {
    const rows = await sql`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'runs'
    `
    const cols = rows.map((r) => r.column_name as string)
    expect(cols).toContain('kind')
    expect(cols).toContain('workout_types')
    expect(cols).toContain('run_group_id')
  })

  it('TigerWolves run resolves kind, workout_types, and run_group_id from the seed', async () => {
    const [tw] = await sql`
      SELECT kind, workout_types, run_group_id FROM runs WHERE id = 'tigerwolves'
    `
    expect(tw.kind).toBe('Workout')
    expect((tw.workout_types as string[]).sort()).toEqual([...TW_TYPES].sort())
    const [group] = await sql`SELECT id FROM run_groups WHERE name = 'TigerWolves'`
    expect(tw.run_group_id).toBe(group.id)
  })

  it("fetchWorkoutVariants('tigerwolves') returns TW-owned + global variants via the FK", async () => {
    const [group] = await sql`SELECT id FROM run_groups WHERE name = 'TigerWolves'`
    const tigerWolvesId = group.id as number
    const variants = await fetchWorkoutVariants('tigerwolves')
    expect(variants.length).toBeGreaterThan(0)
    for (const v of variants) {
      expect(v.runGroupId === null || v.runGroupId === tigerWolvesId).toBe(true)
    }
  })
})

// #319 per-run workout-type cycle engine: cycle_mode + cycle columns on `runs`, the
// TigerWolves cadence seed, and generateScheduleHorizon filling newly generated weeks'
// workout_type from the cycle. Staging-gated for the same reason as #310/#318 above:
// depends on the migration + seed, only guaranteed on staging (CI). The integration
// test also WRITES (generates schedule rows), so it must never touch production.
describe.skipIf(!onStaging)('#319 per-run workout-type cycle engine', () => {
  const TW_CYCLE = {
    '1': 'Hills',
    '2': 'Broken Tempo',
    '3': 'Progression',
    '4': 'Ladder or Superset',
    '5': 'Straight Tempo',
  }

  it('runs table has cycle_mode + cycle columns; TigerWolves seed populated', async () => {
    const rows = await sql`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'runs'
    `
    const cols = rows.map((r) => r.column_name as string)
    expect(cols).toContain('cycle_mode')
    expect(cols).toContain('cycle')

    const [tw] = await sql`SELECT cycle_mode, cycle FROM runs WHERE id = 'tigerwolves'`
    expect(tw.cycle_mode).toBe('week_of_month')
    expect(tw.cycle).toEqual(TW_CYCLE)
  })

  it('generateScheduleHorizon fills workout_type from the cycle', async () => {
    // Clear future tigerwolves rows first so generation produces a fresh, fully
    // cycle-derived horizon. generateScheduleHorizon is insert-only, so any pre-existing
    // future row — a stale pre-cycle blank, or an e2e fixture with a hardcoded type —
    // would otherwise survive and break the "every future week matches the resolver"
    // assertion below. This test runs before the e2e seed (test:unit precedes test:e2e
    // in CI), so it can't assume a clean schedule and must establish its own precondition.
    // Safe: onStaging-gated (never production), and the e2e seed wipes `schedule` wholesale.
    await sql`DELETE FROM schedule WHERE run_id = 'tigerwolves' AND date > CURRENT_DATE`

    // Now generate out to the 24-week horizon: every future row is freshly created and
    // must carry resolveWorkoutType for its own date — non-empty and cadence-correct.
    const roster = await getRunRoster('tigerwolves')
    await generateScheduleHorizon('tigerwolves', 'Tuesday', roster)

    const rows = await sql`
      SELECT to_char(date, 'YYYY-MM-DD') AS date, workout_type FROM schedule
      WHERE run_id = 'tigerwolves' AND date > CURRENT_DATE
      ORDER BY date ASC
    `
    expect(rows.length).toBeGreaterThan(0)

    // At least one future week must carry a non-empty, cadence-correct type, and every
    // future week's stored type must agree with the pure resolver for its own date.
    let sawNonEmpty = false
    for (const r of rows) {
      const dateStr = r.date as string
      const expected = resolveWorkoutType('week_of_month', TW_CYCLE, dateStr)
      expect(r.workout_type).toBe(expected)
      if (expected !== '') sawNonEmpty = true
    }
    expect(sawNonEmpty).toBe(true)
  })
})
