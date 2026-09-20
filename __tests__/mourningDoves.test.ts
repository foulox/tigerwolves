import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { sql, fetchWorkoutVariants } from '../lib/db'
import { schedulePickerSuggestions } from '../lib/schedulePicker'
import type { WorkoutVariantRow } from '../lib/data'
import {
  MOURNING_DOVES_FAMILIES,
  familyLastRan,
  seedMourningDoves,
  type DovesFamily,
} from '../scripts/fixtures/mourningDoves'

// #411: load the real Mourning Doves library — 42 families / 48 variants, family-level
// last_ran (most-recent-variant-wins), per-variant map links. Pure tests run anywhere;
// the seed-integration test is test-data-gated (it writes), same guard as recency.test.ts,
// and fully self-provisions into an isolated sandbox run/group it tears down.

// ── AC1: the fixture data itself — 42 families / 48 variants (pure) ────────────
describe('Mourning Doves fixture shape (AC1)', () => {
  const variantCount = MOURNING_DOVES_FAMILIES.reduce((n, f) => n + f.variants.length, 0)

  test('42 families / 48 variants', () => {
    expect(MOURNING_DOVES_FAMILIES).toHaveLength(42)
    expect(variantCount).toBe(48)
  })

  test('6 families have 2 variants, 36 are standalone', () => {
    const grouped = MOURNING_DOVES_FAMILIES.filter(f => f.variants.length === 2)
    const standalone = MOURNING_DOVES_FAMILIES.filter(f => f.variants.length === 1)
    expect(grouped).toHaveLength(6)
    expect(standalone).toHaveLength(36)
    // No family has 0 or 3+ variants.
    expect(MOURNING_DOVES_FAMILIES.every(f => f.variants.length === 1 || f.variants.length === 2)).toBe(true)
  })

  test('family names are unique', () => {
    const names = MOURNING_DOVES_FAMILIES.map(f => f.name)
    expect(new Set(names).size).toBe(names.length)
  })

  test('standalone variants have a null label; grouped variants are all labelled', () => {
    for (const f of MOURNING_DOVES_FAMILIES) {
      if (f.variants.length === 1) {
        expect(f.variants[0].label).toBeNull()
      } else {
        expect(f.variants.every(v => v.label != null && v.label !== '')).toBe(true)
      }
    }
  })

  test('every map link is a well-formed Strava or MapMyRun route URL', () => {
    const ok = /^https:\/\/www\.(strava\.com\/routes\/\d+|mapmyrun\.com\/routes\/view\/\d+\/)$/
    for (const f of MOURNING_DOVES_FAMILIES) {
      for (const v of f.variants) {
        expect(v.mapLink, `${f.name} / ${v.label ?? '(sole)'}`).toMatch(ok)
      }
    }
  })

  test('every recorded date is a zero-padded YYYY-MM-DD', () => {
    for (const f of MOURNING_DOVES_FAMILIES) {
      for (const v of f.variants) {
        if (v.lastRan != null) expect(v.lastRan).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      }
    }
  })
})

// ── AC3: family last_ran = most recent of its variants' dates (Flag L) ─────────
describe('family last_ran is most-recent-variant-wins (AC3)', () => {
  const byName = (name: string): DovesFamily => {
    const f = MOURNING_DOVES_FAMILIES.find(x => x.name === name)
    if (!f) throw new Error(`fixture family not found: ${name}`)
    return f
  }

  test('the 3 divergent families take the most recent variant date', () => {
    expect(familyLastRan(byName('WUT'))).toBe('2026-03-18') // 2026-02-11 vs 2026-03-18
    expect(familyLastRan(byName('Turkey'))).toBe('2025-11-26') // 2025-11-26 vs 2024-11-27
    expect(familyLastRan(byName("Jane's Carousel"))).toBe('2026-04-15') // 2026-04-15 vs 2024-07-31
  })

  test('a null variant date is ignored (September 11 Memorial → BK Bridge date)', () => {
    const sept11 = byName('September 11 Memorial')
    expect(sept11.variants.map(v => v.lastRan)).toContain(null) // Battery Park has no date
    expect(familyLastRan(sept11)).toBe('2026-09-09')
  })
})

// ── AC4: the recommendation sorts stalest-first using the seeded dates ─────────
describe('recency sort orders stalest-first for the Doves library (AC4)', () => {
  const base: WorkoutVariantRow = {
    id: 0, familyId: 0, name: '', label: null, sortOrder: null, category: 'Long',
    type: 'Long', reason: '', rawInput: '', distTime: '', energySystem: '',
    hrZone: '', rpe: '', coachingNotes: null, mapLink: null, author: null, raceTypes: [],
    trainingPhases: [], hasTurnaround: false, turnaround: '', flagged: false, flagNote: '',
    runGroupId: null, lastRan: null,
  }
  // One row per family, keyed by its computed family last_ran — the shape the picker sees.
  const rows: WorkoutVariantRow[] = MOURNING_DOVES_FAMILIES.map((f, i) => ({
    ...base, id: i + 1, name: f.name, category: 'Long', type: 'Long', lastRan: familyLastRan(f),
  }))

  test('stalest (oldest date) first, most-recent last', () => {
    const sorted = schedulePickerSuggestions({
      showAllRuns: false,
      ownVariants: rows,
      allVariants: [],
      isWorkout: false,
      runCategory: 'Long',
      weekTypes: [],
      browseCategory: null,
      browseType: null,
      plannedId: null,
    })
    const dates = sorted.map(w => w.lastRan)
    const sortedDates = [...dates].sort((a, b) => ((a ?? '0') < (b ?? '0') ? -1 : 1))
    expect(dates).toEqual(sortedDates)
    // The oldest route (Water fountains + Pepsi, 2024-07-17) leads; the freshest
    // (September 11 Memorial, 2026-09-09) trails.
    expect(sorted[0].name).toBe('Water fountains + Pepsi (Gantry-only short route)')
    expect(sorted[sorted.length - 1].name).toBe('September 11 Memorial')
  })
})

// ── AC1/AC3 + #411 map_link: the seed writes it all, idempotently (test-data) ────
const TEST_DATA_HOST = 'ep-fragrant-sunset-atmdps9n-pooler.c-9.us-east-1.aws.neon.tech'
const onTestData = (process.env.DATABASE_URL ?? '').includes(TEST_DATA_HOST)

describe.skipIf(!onTestData)('seedMourningDoves writes the library + membership + last_ran (test-data)', () => {
  // Isolated sandbox so we never touch the shared "Mourning Doves" group, the real
  // `mourning-doves` run, or race the other DB suites on this test-data branch.
  const RUN = 'test-mourning-doves-411'
  const GROUP = 'Mourning Doves TEST 411'
  let groupId: number

  // seedMourningDoves is ~200 sequential Neon round-trips (a one-time data load, not
  // perf-critical), so the seeding hooks need a generous timeout — the default 10s is
  // not enough, and a half-run seed would race teardown into an FK violation.
  const HOOK_MS = 90_000

  // Scoped, FK-safe teardown (run_workouts → variants → families → run → group).
  async function cleanup(): Promise<void> {
    const g = await sql`SELECT id FROM run_groups WHERE name = ${GROUP}`
    if (!g.length) return
    const gid = g[0].id as number
    await sql`DELETE FROM run_workouts WHERE run_id = ${RUN}`
    await sql`DELETE FROM workout_variants WHERE family_id IN (SELECT id FROM workout_families WHERE run_group_id = ${gid})`
    await sql`DELETE FROM workout_families WHERE run_group_id = ${gid}`
    await sql`DELETE FROM runs WHERE id = ${RUN}`
    await sql`DELETE FROM run_groups WHERE id = ${gid}`
  }

  afterAll(cleanup, HOOK_MS)

  beforeAll(async () => {
    await cleanup() // clear any leftovers from a prior aborted run.
    // Stand up an ALREADY-ACTIVATED sandbox run + group (the seed loads the library
    // into an existing run; it no longer creates one). Then load the library.
    groupId = (
      await sql`INSERT INTO run_groups (name, venue, default_location) VALUES (${GROUP}, 'road', NULL) RETURNING id`
    )[0].id as number
    await sql`
      INSERT INTO runs (id, name, day_of_week, kind, run_group_id, status)
      VALUES (${RUN}, 'Sandbox Doves 411', 'Wednesday', 'Long', ${groupId}, 'draft')
    `
    await seedMourningDoves(sql, { runId: RUN })
  }, HOOK_MS)

  test('loads 42 families / 48 variants owned by the group, category Long', async () => {
    const fams = await sql`SELECT COUNT(*)::int AS n FROM workout_families WHERE run_group_id = ${groupId}`
    const vars = await sql`
      SELECT COUNT(*)::int AS n FROM workout_variants
      WHERE family_id IN (SELECT id FROM workout_families WHERE run_group_id = ${groupId})
    `
    const nonLong = await sql`
      SELECT COUNT(*)::int AS n FROM workout_families
      WHERE run_group_id = ${groupId} AND (category <> 'Long' OR type <> 'Long')
    `
    expect(fams[0].n).toBe(42)
    expect(vars[0].n).toBe(48)
    expect(nonLong[0].n).toBe(0)
  })

  test('creates a run_workouts membership row per family with family-level last_ran', async () => {
    const mem = await sql`SELECT COUNT(*)::int AS n FROM run_workouts WHERE run_id = ${RUN}`
    expect(mem[0].n).toBe(42)
    // WUT's membership carries the most-recent variant date.
    const wut = await sql`
      SELECT rw.last_ran FROM run_workouts rw
      JOIN workout_families wf ON wf.id = rw.family_id
      WHERE rw.run_id = ${RUN} AND wf.name = 'WUT'
    `
    expect(wut[0].last_ran).not.toBeNull()
    expect(new Date(wut[0].last_ran as string).toISOString().slice(0, 10)).toBe('2026-03-18')
  })

  test('#411: the two variants of a grouped family keep their OWN map links', async () => {
    const variants = await fetchWorkoutVariants(RUN, RUN)
    const sept11 = variants.filter(v => v.name === 'September 11 Memorial')
    expect(sept11).toHaveLength(2)
    const links = sept11.map(v => v.mapLink).sort()
    expect(new Set(links).size).toBe(2) // two DISTINCT links, not the family fallback twice
    expect(links).toEqual(
      [
        'https://www.strava.com/routes/3400554326374571614',
        'https://www.strava.com/routes/3400560300508891966',
      ].sort(),
    )
    // Both variants of the family share the family-level last_ran (BK Bridge's date).
    expect(sept11.every(v => v.lastRan === '2026-09-09')).toBe(true)
  })

  test('is idempotent — re-running converges to the same 42/48, no duplicates', async () => {
    await seedMourningDoves(sql, { runId: RUN, groupName: GROUP })
    const fams = await sql`SELECT COUNT(*)::int AS n FROM workout_families WHERE run_group_id = ${groupId}`
    const vars = await sql`
      SELECT COUNT(*)::int AS n FROM workout_variants
      WHERE family_id IN (SELECT id FROM workout_families WHERE run_group_id = ${groupId})
    `
    const mem = await sql`SELECT COUNT(*)::int AS n FROM run_workouts WHERE run_id = ${RUN}`
    expect(fams[0].n).toBe(42)
    expect(vars[0].n).toBe(48)
    expect(mem[0].n).toBe(42)
  }, HOOK_MS) // re-seeds — needs the same generous timeout as the seeding hooks.

  test('throws if the target run has not been activated yet (load-only, never creates the run)', async () => {
    await expect(
      seedMourningDoves(sql, { runId: 'test-doves-not-activated-411' }),
    ).rejects.toThrow(/does not exist/)
  })
})
