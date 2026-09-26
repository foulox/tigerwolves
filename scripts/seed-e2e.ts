import { neon } from '@neondatabase/serverless'
import type { Race } from '../lib/data'
import { CURATED_FAMILIES, CURATED_DOVES_ROUTES } from './fixtures/curatedWorkouts'

// Guards against ever running this destructive wipe-and-reseed against
// production — only the test-data branch's host is allowed through. (Renaming the
// Neon branch does NOT change this compute-endpoint host — the guard value is
// stable across the rename.) Update this only if the branch is ever recreated
// (see CLAUDE.md Tooling Notes for how to fetch the current connection string).
const TEST_DATA_HOST = 'ep-fragrant-sunset-atmdps9n-pooler.c-9.us-east-1.aws.neon.tech'

// Guards the KV flush the same way TEST_DATA_HOST guards the DB wipe: only the
// dedicated CI-only Upstash instance may be flushed, never Preview/production KV.
// Update this if the tigerwolves-ci Upstash DB is ever recreated.
const CI_KV_HOST = 'destined-fox-282177.upstash.io'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set')
if (!url.includes(TEST_DATA_HOST)) {
  throw new Error(
    `seed-e2e.ts refuses to run: DATABASE_URL does not point at the test-data Neon branch (expected host ${TEST_DATA_HOST}). Refusing to wipe an unrecognized database.`
  )
}

const sql = neon(url)

// Wipe the votes/race-tags KV so each run starts clean — the DB is reseeded
// every run but KV would otherwise carry state across runs (a prior run's
// ReactionPicker/race-tag write leaves a count behind, flipping "🙂 React" to
// "😡 1 · Add yours" and breaking vote-dependent specs). Host-guarded so it can
// only ever touch the dedicated CI instance. Skips silently when KV creds are
// absent (local DB-only runs); refuses loudly if pointed at a non-CI KV.
async function flushTestKV(): Promise<void> {
  const kvUrl = process.env.KV_REST_API_URL
  if (!kvUrl || !process.env.KV_REST_API_TOKEN) {
    console.log('  (skipping KV flush — KV_REST_API_URL/TOKEN not set)')
    return
  }
  if (!kvUrl.includes(CI_KV_HOST)) {
    throw new Error(
      `seed-e2e.ts refuses to flush KV: KV_REST_API_URL does not point at the CI Upstash instance (expected host ${CI_KV_HOST}). Refusing to wipe an unrecognized KV store.`
    )
  }
  const { kv } = await import('@vercel/kv')
  const keys = [...(await kv.keys('vote:*')), ...(await kv.keys('race-tag:*'))]
  if (keys.length) await kv.del(...keys)
  console.log(`  flushed ${keys.length} KV vote/race-tag key(s) on ${CI_KV_HOST}`)
}

/** Next N Tuesdays from today (inclusive if today is a Tuesday), as YYYY-MM-DD. */
function nextTuesdays(count: number): string[] {
  const dates: string[] = []
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  const dayOfWeek = d.getUTCDay() // 0 = Sunday, 2 = Tuesday
  const daysUntilTuesday = (2 - dayOfWeek + 7) % 7
  d.setUTCDate(d.getUTCDate() + daysUntilTuesday)
  for (let i = 0; i < count; i++) {
    dates.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 7)
  }
  return dates
}

/** Next N Mondays from today (inclusive if today is a Monday), as YYYY-MM-DD — for the MMER (Monday) fixture. */
function nextMondays(count: number): string[] {
  const dates: string[] = []
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  const dayOfWeek = d.getUTCDay() // 0 = Sunday, 1 = Monday
  const daysUntilMonday = (1 - dayOfWeek + 7) % 7
  d.setUTCDate(d.getUTCDate() + daysUntilMonday)
  for (let i = 0; i < count; i++) {
    dates.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 7)
  }
  return dates
}

/** Next N Wednesdays from today (inclusive if today is a Wednesday), as YYYY-MM-DD — for the Mourning Doves (Wednesday) fixture. */
function nextWednesdays(count: number): string[] {
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

/** N days from today, as YYYY-MM-DD — used for race dates, which don't need to fall on a Tuesday. */
function daysFromNow(days: number): string {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const RACES: Omit<Race, 'id'>[] = [
  { date: '', name: 'Brooklyn Half Marathon', distance: '13.1mi', location: 'Prospect Park, Brooklyn', organizer: 'NYRR', verified: true, flagged: false, flagNote: '' },
  { date: '', name: 'Prospect Park 5K Series #3', distance: '5K', location: 'Prospect Park, Brooklyn', organizer: 'NBR', verified: false, flagged: true, flagNote: "Date TBD — organizer hasn't confirmed" },
]

// #276/#277: Library/Schedule/Group Run/Admin all read workout_families/
// workout_variants exclusively — these fixtures are what the e2e specs assert
// against. #426: the fixtures are now a curated subset of REAL production
// workouts (scripts/fixtures/curatedWorkouts.ts), covering every supported
// quality type, seeded onto the REAL runs — no invented shadow run.

export async function seedE2E(): Promise<void> {
  // #404: the library-membership junction (see scripts/migrate-404.sql). Created
  // inline here so CI's test-data DB has it before both the unit suite (globalSetup
  // seeds first) and the e2e run, without a separate migration step. Membership
  // rows are seeded near the end, after all fixture families + runs exist.
  await sql`
    CREATE TABLE IF NOT EXISTS run_workouts (
      run_id     TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      family_id  INT  NOT NULL REFERENCES workout_families(id) ON DELETE CASCADE,
      PRIMARY KEY (run_id, family_id)
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS run_workouts_run_id_idx ON run_workouts (run_id)`

  const [week1, week2, week3] = nextTuesdays(3)
  const [mon1] = nextMondays(1)
  const [wed1, wed2] = nextWednesdays(2)
  RACES[0].date = daysFromNow(10)
  RACES[1].date = daysFromNow(24)

  console.log(`Seeding e2e fixtures against ${url!.split('@')[1]}...`)

  await flushTestKV()

  // Wipe in FK-safe order, then reinsert. run_leaders is scoped to the
  // tigerwolves run so any other seeded runs are left untouched.
  await sql`DELETE FROM schedule`
  await sql`DELETE FROM races`
  // #404: clear library memberships before their families — run_workouts.family_id
  // FKs workout_families(id). CASCADE would handle it, but being explicit keeps the
  // wipe correct even against a test-data table created before the CASCADE was added.
  await sql`DELETE FROM run_workouts`
  await sql`DELETE FROM workout_variants`
  await sql`DELETE FROM workout_families`
  await sql`DELETE FROM run_leaders WHERE run_id IN ('tuesday-morning-tigerwolves', 'monday-morning-easy-run', 'wednesday-mourning-doves')`
  // #330/#331: clear follows on the fixture runs so each run starts from a known
  // clean slate (runner_follows is never wiped otherwise; a mid-test failure could
  // leave a stray row). #331 My Week is follow-based, so the test-leader must start
  // following nothing — both the join/leave e2e and the My Week zero-follows e2e
  // depend on this.
  await sql`DELETE FROM runner_follows WHERE run_id IN ('monday-morning-easy-run', 'tuesday-morning-tigerwolves', 'wednesday-mourning-doves', 'e2e-draft-thursday')`

  // #445: self-heal against legacy run ids this normalization renames. The seed
  // upserts fixtures by id, so on a branch that still holds a pre-#445 'mmer' row
  // (its old id, now 'monday-morning-easy-run') that stale row would fail the
  // id-convention test. Drop the legacy ids first ('tigerwolves' too, as a safety
  // net — migrate-445 renames it). We deliberately do NOT list the deleted
  // Mourning-Doves shadow id here — fixtureGuard forbids that literal in seed
  // scripts, and that shadow only ever existed on test-data and nothing recreates it.
  // schedule/run_workouts are fully wiped above; clear runner_follows/run_leaders
  // for these ids first (run_leaders has no FK, but leaving orphans is untidy).
  await sql`DELETE FROM runner_follows WHERE run_id IN ('mmer', 'tigerwolves')`
  await sql`DELETE FROM run_leaders WHERE run_id IN ('mmer', 'tigerwolves')`
  await sql`DELETE FROM runs WHERE id IN ('mmer', 'tigerwolves')`

  const [tigerWolves] = await sql`SELECT id FROM run_groups WHERE name = 'TigerWolves'`
  if (!tigerWolves) {
    throw new Error(
      "No 'TigerWolves' row in run_groups — run scripts/run-migrate.ts first (it seeds this row as part of #274's migration)."
    )
  }
  const tigerWolvesId = tigerWolves.id as number

  // #331: MMER's own run_group records ownership of its Easy workout family.
  // NOTE: run_group_id does NOT scope library reads — since #347 fetchWorkoutVariants
  // returns the full shared catalog (no run_group filter; its runId arg is ignored)
  // and visibility is filtered client-side by category. Group = ownership only.
  // Select-then-insert rather than a try/catch around the insert: idempotent whether
  // or not the test-data branch actually carries the UNIQUE(name) constraint (a bare
  // catch would either swallow a real insert failure — then crash with a misleading
  // "undefined id" on the next line — or, without the constraint, silently accumulate
  // duplicate rows across runs).
  const existingMmerGroup = await sql`SELECT id FROM run_groups WHERE name = 'MMER'`
  const mmerGroupId = existingMmerGroup.length > 0
    ? (existingMmerGroup[0].id as number)
    : ((await sql`
        INSERT INTO run_groups (name, venue, default_location)
        VALUES ('MMER', 'road', 'McCarren Park')
        RETURNING id
      `)[0].id as number)

  // #426: TigerWolves owns every curated quality-type family (real production
  // rows, frozen in scripts/fixtures/curatedWorkouts.ts).
  for (const f of CURATED_FAMILIES) {
    const [family] = await sql`
      INSERT INTO workout_families (name, category, type, reason, author, run_group_id)
      VALUES (${f.name}, ${f.category}, ${f.type}, ${f.reason}, 'TigerWolves', ${tigerWolvesId})
      RETURNING id
    `
    const familyId = family.id as number
    for (const v of f.variants) {
      await sql`
        INSERT INTO workout_variants (family_id, label, sort_order, raw_input, dist_time, map_link, has_turnaround, turnaround, flagged, flag_note)
        VALUES (${familyId}, ${v.label}, ${v.sortOrder}, ${v.rawInput}, ${v.distTime ?? ''}, ${v.mapLink ?? null}, false, '', ${v.flagged ?? false}, ${v.flagNote ?? ''})
      `
    }
  }

  // #310: seed the `runs` row + `run_leaders` roster the leader surfaces depend on.
  // getLeaderRun() joins run_leaders → runs on clerk_user_id; without a linked row it
  // returns null and /run-config redirects to /. The runs row is normally created by
  // scripts/migrate.sql, but we upsert it here so seed-e2e is self-contained and resets
  // the post-template fields the run-config e2e edits back to a known baseline each run.
  // post_header is the full opening block (header + app link + prompts), matching
  // production and lib/postBuilder.ts, which now emits post_header verbatim (#310).
  const tigerWolvesPostHeader = [
    '🐯🐺 TigerWolves Tuesday Workout',
    '',
    '👉 https://tigerwolves.foulox.me 👈',
    '👀 See every workout between now and the NYC Marathon in the app',
    '🗳️ React to let us know what you like — and what you don\'t',
  ].join('\n')
  await sql`
    INSERT INTO runs (id, name, emoji, day_of_week, meeting_time, meeting_location, closing_notes, post_header, leader_intro)
    VALUES (
      'tuesday-morning-tigerwolves', 'Tuesday Morning Tigerwolves', '🐯🐺', 'Tuesday', '6:30 AM',
      'Tom Stofka Garden, aka "Da Bins"',
      'Bag Drop: Sorry, Not available',
      ${tigerWolvesPostHeader},
      'Run Leaders:'
    )
    ON CONFLICT (id) DO UPDATE SET
      meeting_location = EXCLUDED.meeting_location,
      closing_notes = EXCLUDED.closing_notes,
      post_header = EXCLUDED.post_header,
      leader_intro = EXCLUDED.leader_intro
  `

  // #330: a second platform run (MMER, Monday) so All Runs has a run the
  // tigerwolves test-leader does NOT own — the join target for the join/leave
  // e2e. NBR directory id 'mon-morning-easy'.
  // #331: now a fully-realized Easy run — run_group_id set so its Easy workout
  // resolves, and a schedule + leader below — so My Week shows a real cross-run,
  // kind-driven (Easy/route) card alongside TigerWolves' Workout card.
  await sql`
    INSERT INTO runs (id, name, emoji, description, day_of_week, meeting_time, meeting_location, kind, run_group_id)
    VALUES (
      'monday-morning-easy-run', 'Monday Morning Easy Run', '🌅',
      'North Brooklyn Runners'' Monday morning easy run.',
      'Monday', '6:45 AM', 'McCarren Park', 'Easy', ${mmerGroupId}
    )
    ON CONFLICT (id) DO UPDATE SET
      kind = EXCLUDED.kind,
      run_group_id = EXCLUDED.run_group_id
  `

  // #331: MMER's Easy workout — an Easy/route-kind family so the My Week card
  // renders the route shape (distance from dist_time + "View route ↗" from
  // map_link), the read-side mirror of #322. Owned by the MMER run_group.
  const [mmerFamily] = await sql`
    INSERT INTO workout_families (name, category, type, reason, author, run_group_id, map_link)
    VALUES (
      'McCarren Easy Loop', 'Easy', 'Easy', 'Relaxed conversational miles.',
      'MMER', ${mmerGroupId}, 'https://maps.app.goo.gl/mccarren-easy-loop'
    )
    RETURNING id
  `
  await sql`
    INSERT INTO workout_variants (family_id, label, sort_order, raw_input, dist_time, has_turnaround, turnaround, flagged, flag_note)
    VALUES (
      ${mmerFamily.id as number}, NULL, NULL,
      'Easy conversational pace around McCarren Park and the waterfront.',
      '4 miles', false, '', false, ''
    )
  `

  // #412/#404: a SAME-TYPE cross-run route the TigerWolves (Workout) leader can
  // permanently adopt. Owned by the MMER group but category 'Quality' / type
  // 'Threshold' (in TigerWolves' workout_types), so #412's isRouteAdoptable allows
  // adopt (McCarren Easy is off-type and only borrowable — see schedule.spec.ts).
  // This is the adopt happy-path target for e2e/library.spec.ts; the route category is
  // independent of the owning run's kind.
  const [mmerQualityFamily] = await sql`
    INSERT INTO workout_families (name, category, type, reason, author, run_group_id)
    VALUES (
      'MMER Threshold Session', 'Quality', 'Threshold', 'A borrowable tempo session.',
      'MMER', ${mmerGroupId}
    )
    RETURNING id
  `
  await sql`
    INSERT INTO workout_variants (family_id, label, sort_order, raw_input, has_turnaround, turnaround, flagged, flag_note)
    VALUES (
      ${mmerQualityFamily.id as number}, NULL, NULL,
      '4x(6min @ threshold, 90s float)', false, '', false, ''
    )
  `

  // Roster names match the schedule leaders below so rotation and away-period
  // reassignment resolve to real names. clerk_user_id is left NULL here on purpose:
  // the login is the source of truth for the leader link. e2e/auth.setup.ts reads the
  // real Clerk id from the signed-in session and stamps it onto the first row (Dana Kim),
  // so getLeaderRun() recognizes whatever account actually signs in — no dependency on a
  // hand-maintained id secret. away_periods/email take their column defaults.
  await sql`
    INSERT INTO run_leaders (run_id, name, sort_order, clerk_user_id, active) VALUES
      ('tuesday-morning-tigerwolves', 'Dana Kim',   1, NULL, true),
      ('tuesday-morning-tigerwolves', 'Marcus Ade', 2, NULL, true),
      ('tuesday-morning-tigerwolves', 'Priya Shah', 3, NULL, true)
  `
  // #331: MMER's leader — the "Led by" name on its My Week card. (R4 wires
  // foulox+mmer as MMER's signed-in owning leader; for R3 this is just a name.)
  await sql`
    INSERT INTO run_leaders (run_id, name, sort_order, clerk_user_id, active) VALUES
      ('monday-morning-easy-run', 'Sam Rivera', 1, NULL, true)
  `

  // workout_type must match the assigned workout's own "type" field (not its
  // "category") — ScheduleClient's suggestion picker filters library workouts by
  // types.includes(w.type) against this column, so a mismatch here silently
  // empties the picker instead of erroring. #426: types are now the canonical
  // WORKOUT_TYPE_OPTIONS values (Intervals/Hills, not the old 'Interval').
  await sql`
    INSERT INTO schedule (date, run_id, workout_type, leader, workout_name)
    VALUES (${week1}::date, 'tuesday-morning-tigerwolves', 'Intervals', 'Dana Kim', '300m''s on Down')
  `
  await sql`
    INSERT INTO schedule (date, run_id, workout_type, leader, workout_name)
    VALUES (${week2}::date, 'tuesday-morning-tigerwolves', 'Hills', 'Marcus Ade', 'Hills - 2 Sets 7x30s')
  `
  await sql`
    INSERT INTO schedule (date, run_id, workout_type, leader, workout_name)
    VALUES (${week3}::date, 'tuesday-morning-tigerwolves', 'Hills', 'Priya Shah', NULL)
  `
  // #331: MMER's next-Monday entry — inside the My Week default forward window, so
  // a follower sees it interleaved with TigerWolves' Tuesday. workout_type matches
  // the Easy family's own "type" (see note above).
  await sql`
    INSERT INTO schedule (date, run_id, workout_type, leader, workout_name)
    VALUES (${mon1}::date, 'monday-morning-easy-run', 'Easy', 'Sam Rivera', 'McCarren Easy Loop')
  `

  // #426: the REAL Mourning Doves run (run_id 'wednesday-mourning-doves', kind
  // 'Long') — no longer a separate shadow run. It owns a couple of curated
  // REAL Long routes (CURATED_DOVES_ROUTES) so #382's route-run preview and the
  // per-run route card have a genuine Long/route fixture to exercise. Its group is
  // the same "Wednesday Mourning Doves" activation creates in production.
  // clerk_user_id on the leader is NULL — link an account to browse it as leader.
  const existingDovesGroup = await sql`SELECT id FROM run_groups WHERE name = 'Wednesday Mourning Doves'`
  const dovesGroupId = existingDovesGroup.length > 0
    ? (existingDovesGroup[0].id as number)
    : ((await sql`
        INSERT INTO run_groups (name, venue, default_location)
        VALUES ('Wednesday Mourning Doves', 'road', 'Grand Army Plaza')
        RETURNING id
      `)[0].id as number)
  await sql`
    INSERT INTO runs (id, name, emoji, description, day_of_week, meeting_time, meeting_location, kind, run_group_id, status)
    VALUES (
      'wednesday-mourning-doves', 'Wednesday Mourning Doves', '🕊️',
      'A steady, social long run through Brooklyn — conversational pace, no one left behind.',
      'Wednesday', '6:00 AM', 'Prospect Park — Grand Army Plaza entrance',
      'Long', ${dovesGroupId}, 'live'
    )
    ON CONFLICT (id) DO UPDATE SET
      kind = EXCLUDED.kind, run_group_id = EXCLUDED.run_group_id, status = EXCLUDED.status
  `
  await sql`
    INSERT INTO run_leaders (run_id, name, sort_order, clerk_user_id, active) VALUES
      ('wednesday-mourning-doves', 'Doves Lead', 1, NULL, true)
  `
  for (const route of CURATED_DOVES_ROUTES) {
    const [dovesFamily] = await sql`
      INSERT INTO workout_families (name, category, type, reason, author, run_group_id, map_link)
      VALUES (${route.name}, 'Long', 'Long', 'A social long route at conversational effort.', 'Wednesday Mourning Doves', ${dovesGroupId}, ${route.mapLink})
      RETURNING id
    `
    await sql`
      INSERT INTO workout_variants (family_id, label, sort_order, raw_input, dist_time, map_link, has_turnaround, turnaround, flagged, flag_note)
      VALUES (${dovesFamily.id as number}, NULL, NULL, '', ${route.distTime}, ${route.mapLink}, false, '', false, '')
    `
  }
  await sql`
    INSERT INTO schedule (date, run_id, workout_type, leader, workout_name)
    VALUES (${wed1}::date, 'wednesday-mourning-doves', 'Long', 'Doves Lead', ${CURATED_DOVES_ROUTES[0].name})
  `
  await sql`
    INSERT INTO schedule (date, run_id, workout_type, leader, workout_name)
    VALUES (${wed2}::date, 'wednesday-mourning-doves', 'Long', 'Doves Lead', ${CURATED_DOVES_ROUTES[1].name})
  `

  // #365/Task 9: a dedicated draft run for draft-gating e2e tests. Kind 'Easy',
  // day 'Thursday' — chosen to not affect any filter count assertion in all-runs.spec.ts.
  // No schedule, no run_leaders row needed (draft-gating tests only need the runs row).
  // ON CONFLICT keeps it draft on re-seed.
  await sql`
    INSERT INTO runs (id, name, emoji, day_of_week, meeting_time, meeting_location, kind, distance, status)
    VALUES ('e2e-draft-thursday', 'E2E Draft Thursday', NULL, 'Thursday', '6:30am', 'McCarren Park', 'Easy', '3–4 mi', 'draft')
    ON CONFLICT (id) DO UPDATE SET
      status = 'draft',
      day_of_week = EXCLUDED.day_of_week,
      kind = EXCLUDED.kind,
      meeting_time = EXCLUDED.meeting_time,
      meeting_location = EXCLUDED.meeting_location,
      distance = EXCLUDED.distance,
      name = EXCLUDED.name
  `

  for (const r of RACES) {
    await sql`
      INSERT INTO races (date, name, distance, location, organizer, verified, flagged, flag_note)
      VALUES (${r.date}::date, ${r.name}, ${r.distance}, ${r.location}, ${r.organizer}, ${r.verified}, ${r.flagged}, ${r.flagNote})
    `
  }

  // #404: seed library membership uniformly — every run gets a run_workouts row for
  // each family its run_group owns (the same seed scripts/migrate-404.sql runs on
  // production). This makes "Your run" a single membership check covering created
  // routes; adoption (the e2e/unit tests, real leaders) adds more rows. Runs with a
  // NULL run_group_id own nothing here and fall back to the full catalog in the UI.
  await sql`
    INSERT INTO run_workouts (run_id, family_id)
    SELECT r.id, wf.id
    FROM workout_families wf
    JOIN runs r ON r.run_group_id = wf.run_group_id
    ON CONFLICT (run_id, family_id) DO NOTHING
  `

  const familyCount = CURATED_FAMILIES.length + 1 + CURATED_DOVES_ROUTES.length // + MMER Easy + doves routes
  console.log(`  seeded ${familyCount} workout_families, 4 runs (tuesday-morning-tigerwolves + monday-morning-easy-run + wednesday-mourning-doves + e2e-draft-thursday) + 5 run_leaders, ${4 + CURATED_DOVES_ROUTES.length} schedule entries (tuesday-morning-tigerwolves: ${week1}, ${week2}, ${week3}; monday-morning-easy-run: ${mon1}; wednesday-mourning-doves: ${wed1}, ${wed2}), ${RACES.length} races, run_workouts membership seeded`)
}
