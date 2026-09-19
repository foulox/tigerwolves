import type { NeonQueryFunction } from '@neondatabase/serverless'

// A Neon tagged-template SQL client (what `neon(url)` returns — default
// non-array, non-full-results mode). Matches dovesLongRun.ts so the fixture is
// portable across seed scripts and its query results are plain row arrays.
type Sql = NeonQueryFunction<false, false>

// ─────────────────────────────────────────────────────────────────────────────
// Story #411 — the real Mourning Doves route library.
//
// Data spec: scratch/doves-import-mapping.md (locked 2026-09-18), cross-checked
// against the source sheet for the authoritative full URLs. 48 routes:
// 6 families with 2 variants each + 36 standalone families = 42 families / 48
// variants, all owned by the "Mourning Doves" run_group, category/type = Long.
//
// Deliberate spec calls folded in here:
//  - Easter Island is ONE sheet row offering two alternative routes ("... OR ...")
//    → loaded as one family with two variants.
//  - The stale 2023 standalone "Battery Park route" (a different route from the
//    Sept 11 "Battery Park" variant) is excluded, per the spec's 48.
//  - last_ran is FAMILY-level, most-recent-variant-wins (Flag L). Per-variant
//    dates are kept here so the family date is DERIVED (single source of truth),
//    and the older variant's date is descriptive only. The Sept 11 "Battery Park"
//    variant has no recorded date (null) — the family date is BK Bridge's.
//  - map_link is per-VARIANT (#411 migration adds workout_variants.map_link); the
//    two variants of a grouped family are genuinely different routes with
//    different links. The family map_link is set to the primary variant's link as
//    a fallback for any reader that still keys off wf.map_link.
// ─────────────────────────────────────────────────────────────────────────────

export interface DovesVariant {
  /** null = sole/standard variant (a standalone route); a name when the family has 2. */
  label: string | null
  distMiles: number
  mapLink: string
  /** YYYY-MM-DD, or null when this specific variant has no recorded run date. */
  lastRan: string | null
}

export interface DovesFamily {
  name: string
  variants: DovesVariant[]
}

const strava = (id: string) => `https://www.strava.com/routes/${id}`
const mapmyrun = (id: string) => `https://www.mapmyrun.com/routes/view/${id}/`

// 6 families with 2 variants each — variants are distinct routes with their own
// map link + distance (+ their own date; the family shows the most recent).
const GROUPED: DovesFamily[] = [
  {
    name: 'September 11 Memorial',
    variants: [
      { label: 'BK Bridge', distMiles: 10, mapLink: strava('3400554326374571614'), lastRan: '2026-09-09' },
      { label: 'Battery Park', distMiles: 10, mapLink: strava('3400560300508891966'), lastRan: null },
    ],
  },
  {
    name: 'Beach Day',
    variants: [
      { label: 'Longer', distMiles: 12.95, mapLink: strava('2994648205375582102'), lastRan: '2026-08-12' },
      { label: 'Shorter', distMiles: 6.88, mapLink: strava('3123661487876511800'), lastRan: '2026-08-12' },
    ],
  },
  {
    name: 'Easter Island',
    variants: [
      { label: 'QB Bridge, down 1st Ave', distMiles: 10, mapLink: strava('3322305265412885992'), lastRan: '2026-04-08' },
      { label: 'Ms. PacMan', distMiles: 10, mapLink: strava('3475904345550614684'), lastRan: '2026-04-08' },
    ],
  },
  {
    name: 'WUT',
    variants: [
      { label: 'WUT', distMiles: 9.22, mapLink: strava('2842049331390821444'), lastRan: '2026-02-11' },
      { label: "Women's history edition", distMiles: 9, mapLink: strava('3468022067446816926'), lastRan: '2026-03-18' },
    ],
  },
  {
    name: 'Turkey',
    variants: [
      { label: 'With a Hat (counterclockwise)', distMiles: 10, mapLink: strava('3427762547306759518'), lastRan: '2025-11-26' },
      { label: 'Traditional, no hat (clockwise)', distMiles: 10.07, mapLink: strava('22741932'), lastRan: '2024-11-27' },
    ],
  },
  {
    name: "Jane's Carousel",
    variants: [
      { label: "Jane's Carousel", distMiles: 8.55, mapLink: strava('6647021'), lastRan: '2026-04-15' },
      { label: 'Doves, DUMBO, donuts (ending at Peter Pan)', distMiles: 9.07, mapLink: mapmyrun('6167055370'), lastRan: '2024-07-31' },
    ],
  },
]

// 36 standalone routes — one variant each (label null).
const STANDALONE: Array<{ name: string; distMiles: number; mapLink: string; lastRan: string }> = [
  { name: 'Eastbound and Down', distMiles: 8.88, mapLink: strava('3324355930994658434'), lastRan: '2026-09-02' },
  { name: 'Socrates Sculpture Park', distMiles: 8.01, mapLink: strava('7470772'), lastRan: '2026-08-26' },
  { name: 'The Big Square', distMiles: 11.63, mapLink: strava('3055329963508007600'), lastRan: '2026-08-19' },
  { name: 'East Village and John V. Lindsay East River Park', distMiles: 10, mapLink: strava('3407420830709431600'), lastRan: '2026-08-05' },
  { name: 'Columbus Circle Loop', distMiles: 12.31, mapLink: strava('2890392583665325508'), lastRan: '2026-07-29' },
  { name: 'Double Bridge Score / Manhattan Bridge to Williamsburg Bridge', distMiles: 8.32, mapLink: strava('2781745587547563092'), lastRan: '2026-07-22' },
  { name: 'Cemetery + Gantry summer 2-for-1 special feat. water fountains', distMiles: 9.55, mapLink: mapmyrun('6600419946'), lastRan: '2026-07-15' },
  { name: 'The Peanut', distMiles: 9.9, mapLink: strava('2938627265765022768'), lastRan: '2026-07-08' },
  { name: 'All The Water Fountains', distMiles: 9.4, mapLink: strava('3506443192297552740'), lastRan: '2026-07-01' },
  { name: 'Stonewall', distMiles: 8.6, mapLink: mapmyrun('6112531873'), lastRan: '2026-06-24' },
  { name: 'Juneteenth Grove', distMiles: 9.2, mapLink: strava('3237960930183341486'), lastRan: '2026-06-17' },
  { name: 'Wagner Pavillion', distMiles: 9.8, mapLink: strava('3475897279414145322'), lastRan: '2026-06-10' },
  { name: 'The Shoe', distMiles: 8.25, mapLink: strava('2796433250772691496'), lastRan: '2026-06-03' },
  { name: 'Brooklyn Bridge to Williamsburg Bridge / Tourist Free Brooklyn Bridge', distMiles: 9.54, mapLink: mapmyrun('4849504324'), lastRan: '2026-05-27' },
  { name: 'Shrek', distMiles: 8.2, mapLink: strava('3367232570732894478'), lastRan: '2026-05-20' },
  { name: 'Clockwise WB GP Newtown Creek Cemetery K Bridge (WBGPNCCCKB?)', distMiles: 9.42, mapLink: strava('3450650225775496004'), lastRan: '2026-05-13' },
  { name: 'Brooklyn Half preview — Mile 1 only', distMiles: 10.5, mapLink: strava('3485282426598772696'), lastRan: '2026-05-06' },
  { name: 'Fort Greene Loop', distMiles: 7.87, mapLink: strava('2959063807382857516'), lastRan: '2026-04-29' },
  { name: 'Kiss Prospect, Back on Bedford', distMiles: 9.72, mapLink: strava('2865055028150467092'), lastRan: '2026-04-01' },
  { name: 'Roosevelt Island', distMiles: 11.25, mapLink: strava('24312406'), lastRan: '2026-03-25' },
  { name: 'The Worm', distMiles: 8.97, mapLink: strava('3192540033390467408'), lastRan: '2026-03-04' },
  { name: 'The Cow Horn / Portrait of Prancer', distMiles: 9.62, mapLink: strava('2880215457642255716'), lastRan: '2026-02-04' },
  { name: 'Ridgewood reservoir', distMiles: 10, mapLink: strava('3448131992164059140'), lastRan: '2026-01-21' },
  { name: 'Manhattan-Henge Sunrise (WSH → 14th St)', distMiles: 10.3, mapLink: strava('3439991780976932246'), lastRan: '2026-01-07' },
  { name: 'The sands of time (infinity sign / hourglass / Crazy Eights)', distMiles: 7.8, mapLink: strava('3272978401836089060'), lastRan: '2025-12-31' },
  { name: 'Trip to GAP whilst trying to avoid icy sidewalks', distMiles: 9.5, mapLink: strava('3436122100816967162'), lastRan: '2025-12-17' },
  { name: 'Rockefeller Tree Run ("Oh Dovesmas Tree")', distMiles: 5.53, mapLink: strava('16462491'), lastRan: '2025-12-10' },
  { name: 'Marathon Dreams', distMiles: 3.5, mapLink: strava('2890395222879378398'), lastRan: '2025-10-29' },
  { name: 'Calvary Cemetery (Haunted Doves)', distMiles: 7.76, mapLink: mapmyrun('4710485593'), lastRan: '2025-10-22' },
  { name: 'Ugly Pumpkin', distMiles: 7.73, mapLink: strava('2896907608974698596'), lastRan: '2025-10-15' },
  { name: '17 E 76th St', distMiles: 11.44, mapLink: mapmyrun('6123522511'), lastRan: '2025-07-02' },
  { name: 'Park Circle route / Local Park Loops', distMiles: 8.71, mapLink: strava('2977435893402053374'), lastRan: '2025-05-14' },
  { name: 'DUMBO Tourism Run', distMiles: 10.65, mapLink: mapmyrun('5479715935'), lastRan: '2025-05-07' },
  { name: 'East to Hudson River Tour (lower manhattan waterfront)', distMiles: 11.01, mapLink: mapmyrun('5490732886'), lastRan: '2025-04-09' },
  { name: 'Black History Month (downtown Brooklyn)', distMiles: 9.9, mapLink: mapmyrun('6430947145'), lastRan: '2025-02-26' },
  { name: 'Water fountains + Pepsi (Gantry-only short route)', distMiles: 5.58, mapLink: mapmyrun('6145184635'), lastRan: '2024-07-17' },
]

/** The full 42-family / 48-variant Mourning Doves library. */
export const MOURNING_DOVES_FAMILIES: DovesFamily[] = [
  ...GROUPED,
  ...STANDALONE.map(
    (r): DovesFamily => ({
      name: r.name,
      variants: [{ label: null, distMiles: r.distMiles, mapLink: r.mapLink, lastRan: r.lastRan }],
    }),
  ),
]

/**
 * Family-level last_ran: the most recent of the family's variant dates, or null
 * if none has a recorded date (Flag L — most-recent-variant-wins). Lexical MAX is
 * correct for zero-padded YYYY-MM-DD strings.
 */
export function familyLastRan(family: DovesFamily): string | null {
  const dates = family.variants.map(v => v.lastRan).filter((d): d is string => d != null)
  return dates.length ? dates.reduce((a, b) => (a >= b ? a : b)) : null
}

export const MOURNING_DOVES_RUN_ID = 'mourning-doves'
export const MOURNING_DOVES_GROUP = 'Mourning Doves'

/**
 * Seed the real Mourning Doves run + its 42-family / 48-variant route library into
 * the database named by DATABASE_URL. Idempotent and additive:
 *  - run_group "Mourning Doves" is reused by name if present (shared with the
 *    `doves` e2e/preview fixture), else created — never clobbered.
 *  - the run row is upserted by id.
 *  - families are matched by (run_group_id, name); variants by (family_id, label).
 *    Re-runs converge (update in place, no duplicates).
 *  - run_workouts membership + last_ran is upserted per family for this run.
 * It never wipes a table and only ever writes rows for THIS run/group, so it is
 * safe against production, demo-data, and production-forked Preview branches.
 *
 * runId/groupName are injectable so tests can seed an isolated sandbox without
 * touching the shared "Mourning Doves" group or the real run.
 */
export async function seedMourningDoves(
  sql: Sql,
  opts: { runId?: string; groupName?: string } = {},
): Promise<void> {
  const runId = opts.runId ?? MOURNING_DOVES_RUN_ID
  const groupName = opts.groupName ?? MOURNING_DOVES_GROUP

  // run_group: reuse by name if present, else create. Never deleted.
  const existingGroup = await sql`SELECT id FROM run_groups WHERE name = ${groupName}`
  const groupId =
    existingGroup.length > 0
      ? (existingGroup[0].id as number)
      : ((
          await sql`
            INSERT INTO run_groups (name, venue, default_location)
            VALUES (${groupName}, 'road', NULL)
            RETURNING id
          `
        )[0].id as number)

  // The run row — upsert so re-runs converge. Meeting time/location and post
  // template are left for the leader to complete in-app (out of scope per #411).
  await sql`
    INSERT INTO runs (id, name, emoji, description, day_of_week, kind, run_group_id, status)
    VALUES (
      ${runId}, 'Mourning Doves', '🕊️',
      'North Brooklyn Runners'' Wednesday long run.',
      'Wednesday', 'Long', ${groupId}, 'live'
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name, emoji = EXCLUDED.emoji, description = EXCLUDED.description,
      day_of_week = EXCLUDED.day_of_week, kind = EXCLUDED.kind,
      run_group_id = EXCLUDED.run_group_id
  `

  for (const family of MOURNING_DOVES_FAMILIES) {
    // Family map_link fallback = the primary (first) variant's link.
    const familyMap = family.variants[0].mapLink

    const existingFamily = await sql`
      SELECT id FROM workout_families WHERE run_group_id = ${groupId} AND name = ${family.name}
    `
    const familyId =
      existingFamily.length > 0
        ? (existingFamily[0].id as number)
        : ((
            await sql`
              INSERT INTO workout_families (name, category, type, run_group_id, map_link)
              VALUES (${family.name}, 'Long', 'Long', ${groupId}, ${familyMap})
              RETURNING id
            `
          )[0].id as number)

    // Converge an existing family (category/type/map_link) on re-run.
    if (existingFamily.length > 0) {
      await sql`
        UPDATE workout_families
        SET category = 'Long', type = 'Long', map_link = ${familyMap}
        WHERE id = ${familyId}
      `
    }

    // Variants — match by (family_id, label). label NULL for the sole variant of a
    // standalone family; a name for the two variants of a grouped family.
    for (let i = 0; i < family.variants.length; i++) {
      const v = family.variants[i]
      const distTime = `${v.distMiles} miles`
      const sortOrder = family.variants.length > 1 ? i + 1 : null

      const existingVariant =
        v.label == null
          ? await sql`SELECT id FROM workout_variants WHERE family_id = ${familyId} AND label IS NULL`
          : await sql`SELECT id FROM workout_variants WHERE family_id = ${familyId} AND label = ${v.label}`

      if (existingVariant.length === 0) {
        await sql`
          INSERT INTO workout_variants (family_id, label, sort_order, raw_input, dist_time, map_link, has_turnaround, turnaround, flagged, flag_note)
          VALUES (${familyId}, ${v.label}, ${sortOrder}, '', ${distTime}, ${v.mapLink}, false, '', false, '')
        `
      } else {
        await sql`
          UPDATE workout_variants
          SET sort_order = ${sortOrder}, dist_time = ${distTime}, map_link = ${v.mapLink}
          WHERE id = ${existingVariant[0].id as number}
        `
      }
    }

    // Library membership + family-level recency for THIS run. Upsert so re-runs
    // reconverge last_ran.
    const lastRan = familyLastRan(family)
    await sql`
      INSERT INTO run_workouts (run_id, family_id, last_ran)
      VALUES (${runId}, ${familyId}, ${lastRan})
      ON CONFLICT (run_id, family_id) DO UPDATE SET last_ran = EXCLUDED.last_ran
    `
  }
}
