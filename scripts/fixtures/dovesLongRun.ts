import type { NeonQueryFunction } from '@neondatabase/serverless'

// A Neon tagged-template SQL client (what `neon(url)` returns — default
// non-array, non-full-results mode). Both seed-e2e and refresh-demo build one
// this way, so the fixture is portable across them and its query results are
// plain row arrays (`.length` / `[0]` indexable).
type Sql = NeonQueryFunction<false, false>

/**
 * Next N Wednesdays from today (inclusive if today is a Wednesday), as
 * YYYY-MM-DD — the Mourning Doves is a Wednesday run.
 */
export function nextWednesdays(count: number): string[] {
  const dates: string[] = []
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  const dayOfWeek = d.getUTCDay() // 0 = Sunday, 3 = Wednesday
  const daysUntilWednesday = (3 - dayOfWeek + 7) % 7
  d.setUTCDate(d.getUTCDate() + daysUntilWednesday)
  for (let i = 0; i < count; i++) {
    dates.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 7)
  }
  return dates
}

// The two route workouts the Doves Long run previews against (#391). Each is a
// Long/route family — map_link + dist_time, no interval block — so #387's
// route-post path renders description + 🏃 distance + 🗺️ route link.
const DOVES_ROUTES = [
  {
    name: 'Prospect Park Long Loop',
    dist: '12 miles',
    map: 'https://maps.app.goo.gl/prospect-park-long-loop',
    desc: 'Out from Grand Army Plaza, two full Prospect Park loops, finish at the plaza.',
  },
  {
    name: 'Waterfront Long Out-and-Back',
    dist: '9 miles',
    map: 'https://maps.app.goo.gl/bk-waterfront-out-and-back',
    desc: 'North along the East River waterfront to DUMBO and back — flat and scenic.',
  },
] as const

const DOVES_POST_HEADER = [
  '🕊️ Mourning Doves Long Run',
  '',
  '👉 https://tigerwolves.foulox.me 👈',
  'A relaxed, social long run — steady conversational effort, nobody dropped.',
].join('\n')

/**
 * Seed a durable Mourning Doves Long/route run (run_id `doves`, kind `Long`) so
 * #387's route-post path and #382's route-run preview have a real, browsable
 * fixture. Extracted from seed-e2e so the same run can be seeded into the demo
 * branch (refresh-demo) and into a per-PR Preview branch (scripts/seed-doves).
 *
 * SAFE FOR NON-WIPE TARGETS (demo, production-forked previews): this NEVER wipes
 * a table globally. Its only deletes are scoped to `run_id = 'doves'` — a run id
 * that exists nowhere but this fixture, so it cannot touch real data. Workout
 * families are matched by (run_group_id, name) and inserted only when absent, so
 * an existing real "Mourning Doves" run_group is reused, never clobbered.
 *
 * Idempotent: re-running converges to the same rows (no duplicates, no drift).
 *
 * clerk_user_id on the leader row is left NULL — link an account to run_id
 * 'doves' (or add a leader via the app) to browse it as a leader.
 */
export async function seedDovesLongRun(sql: Sql): Promise<void> {
  // run_group: reuse an existing "Mourning Doves" group if present, else create
  // one. Never deleted — an existing real group and its families are preserved.
  const existingGroup = await sql`SELECT id FROM run_groups WHERE name = 'Mourning Doves'`
  const groupId =
    existingGroup.length > 0
      ? (existingGroup[0].id as number)
      : ((
          await sql`
            INSERT INTO run_groups (name, venue, default_location)
            VALUES ('Mourning Doves', 'road', 'Grand Army Plaza')
            RETURNING id
          `
        )[0].id as number)

  // The run row itself — upsert, so re-runs converge and an existing row updates.
  await sql`
    INSERT INTO runs (id, name, emoji, description, day_of_week, meeting_time, meeting_location, kind, run_group_id, post_header, leader_intro, closing_notes)
    VALUES (
      'doves', 'Mourning Doves', '🕊️',
      'The Doves long run — a steady, social route through Prospect Park and the waterfront. Conversational pace, no one left behind.',
      'Wednesday', '6:00 AM', 'Prospect Park — Grand Army Plaza entrance',
      'Long', ${groupId}, ${DOVES_POST_HEADER}, 'Your Doves leaders:', 'Coffee at the plaza after.'
    )
    ON CONFLICT (id) DO UPDATE SET
      kind = EXCLUDED.kind, description = EXCLUDED.description,
      run_group_id = EXCLUDED.run_group_id, post_header = EXCLUDED.post_header,
      leader_intro = EXCLUDED.leader_intro, closing_notes = EXCLUDED.closing_notes
  `

  // Route families/variants — additive and existence-guarded by (group, name),
  // so a real Mourning Doves family is never duplicated or overwritten.
  for (const r of DOVES_ROUTES) {
    const existingFamily = await sql`
      SELECT id FROM workout_families WHERE run_group_id = ${groupId} AND name = ${r.name}
    `
    const familyId =
      existingFamily.length > 0
        ? (existingFamily[0].id as number)
        : ((
            await sql`
              INSERT INTO workout_families (name, category, type, reason, author, run_group_id, map_link)
              VALUES (${r.name}, 'Long', 'Long', 'A social long route at conversational effort.', 'Mourning Doves', ${groupId}, ${r.map})
              RETURNING id
            `
          )[0].id as number)

    const existingVariant = await sql`SELECT id FROM workout_variants WHERE family_id = ${familyId}`
    if (existingVariant.length === 0) {
      await sql`
        INSERT INTO workout_variants (family_id, label, sort_order, raw_input, dist_time, has_turnaround, turnaround, flagged, flag_note)
        VALUES (${familyId}, NULL, NULL, ${r.desc}, ${r.dist}, false, '', false, '')
      `
    }
  }

  // Leader + schedule are fully owned by this fixture (run_id 'doves'), so a
  // scoped delete-then-insert is safe and keeps them from drifting on re-run.
  await sql`DELETE FROM schedule WHERE run_id = 'doves'`
  await sql`DELETE FROM run_leaders WHERE run_id = 'doves'`

  await sql`
    INSERT INTO run_leaders (run_id, name, sort_order, clerk_user_id, active)
    VALUES ('doves', 'Doves Lead', 1, NULL, true)
  `

  const [week1, week2] = nextWednesdays(2)
  await sql`
    INSERT INTO schedule (date, run_id, workout_type, leader, workout_name)
    VALUES (${week1}::date, 'doves', 'Long', 'Doves Lead', 'Prospect Park Long Loop')
  `
  await sql`
    INSERT INTO schedule (date, run_id, workout_type, leader, workout_name)
    VALUES (${week2}::date, 'doves', 'Long', 'Doves Lead', 'Waterfront Long Out-and-Back')
  `
}
