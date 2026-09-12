import { neon } from '@neondatabase/serverless'
import type { Race } from '../lib/data'

// Guards against ever running this destructive wipe-and-reseed against
// production — only the staging branch's host is allowed through. Update this
// if the staging branch is ever recreated (see CLAUDE.md Tooling Notes for how
// to fetch the current connection string).
const STAGING_HOST = 'ep-fragrant-sunset-atmdps9n-pooler.c-9.us-east-1.aws.neon.tech'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set')
if (!url.includes(STAGING_HOST)) {
  throw new Error(
    `seed-e2e.ts refuses to run: DATABASE_URL does not point at the staging Neon branch (expected host ${STAGING_HOST}). Refusing to wipe an unrecognized database.`
  )
}

const sql = neon(url)

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

// #276/#277: Library/Plan/Schedule/Admin all read workout_families/
// workout_variants exclusively — these fixtures are what the e2e specs
// assert against.
type VariantFixture = {
  label: string | null
  sortOrder: number | null
  rawInput: string
  flagged?: boolean
  flagNote?: string
}

type FamilyFixture = {
  name: string
  category: string
  type: string
  reason: string
  variants: VariantFixture[]
}

const FAMILIES: FamilyFixture[] = [
  {
    name: 'Easy Recovery Run', category: 'Easy', type: 'Recovery', reason: 'E2E fixture workout.',
    variants: [{ label: null, sortOrder: null, rawInput: 'Fixture instructions — seeded by scripts/seed-e2e.ts.' }],
  },
  {
    name: 'Long Run — Progressive', category: 'Long', type: 'Progressive', reason: 'E2E fixture workout.',
    variants: [{ label: null, sortOrder: null, rawInput: 'Fixture instructions — seeded by scripts/seed-e2e.ts.' }],
  },
  {
    name: 'Yasso 800s', category: 'Quality', type: 'Interval', reason: 'E2E fixture workout.',
    variants: [{
      label: null, sortOrder: null, rawInput: '10x800m @ 5K effort, 400m jog recovery.',
      flagged: true, flagNote: "We've actually been running 8 reps lately, not 10 — might be worth double-checking.",
    }],
  },
  {
    name: 'Fort Greene Hills', category: 'Quality', type: 'Hills', reason: 'E2E fixture workout.',
    variants: [{ label: null, sortOrder: null, rawInput: '8x90sec hill repeats, jog down recovery.' }],
  },
  {
    name: 'Prospect Park Tempo', category: 'Quality', type: 'Straight Tempo', reason: 'E2E fixture workout.',
    variants: [{ label: null, sortOrder: null, rawInput: '20min @ tempo effort around the loop.' }],
  },
  {
    name: 'Track Ladder 400-800-1200', category: 'Quality', type: 'Ladder', reason: 'E2E fixture workout.',
    variants: [{ label: null, sortOrder: null, rawInput: '400-800-1200-800-400 @ 5K effort, equal jog recovery.' }],
  },
  {
    name: 'McCarren Loop Repeats', category: 'Quality', type: 'Interval', reason: 'E2E fixture workout.',
    variants: [
      { label: 'Short loop, 6x800m', sortOrder: 1, rawInput: 'Short loop, 6x800m' },
      { label: 'Long loop, 4x1200m', sortOrder: 2, rawInput: 'Long loop, 4x1200m' },
    ],
  },
]

export async function seedE2E(): Promise<void> {
  const [week1, week2, week3] = nextTuesdays(3)
  const [mon1] = nextMondays(1)
  RACES[0].date = daysFromNow(10)
  RACES[1].date = daysFromNow(24)

  console.log(`Seeding e2e fixtures against ${url!.split('@')[1]}...`)

  // Wipe in FK-safe order, then reinsert. run_leaders is scoped to the
  // tigerwolves run so any other seeded runs are left untouched.
  await sql`DELETE FROM schedule`
  await sql`DELETE FROM races`
  await sql`DELETE FROM workout_variants`
  await sql`DELETE FROM workout_families`
  await sql`DELETE FROM run_leaders WHERE run_id IN ('tigerwolves', 'mmer')`
  // #330/#331: clear follows on the fixture runs so each run starts from a known
  // clean slate (runner_follows is never wiped otherwise; a mid-test failure could
  // leave a stray row). #331 My Week is follow-based, so the test-leader must start
  // following nothing — both the join/leave e2e and the My Week zero-follows e2e
  // depend on this.
  await sql`DELETE FROM runner_follows WHERE run_id IN ('mmer', 'tigerwolves')`

  const [tigerWolves] = await sql`SELECT id FROM run_groups WHERE name = 'TigerWolves'`
  if (!tigerWolves) {
    throw new Error(
      "No 'TigerWolves' row in run_groups — run scripts/run-migrate.ts first (it seeds this row as part of #274's migration)."
    )
  }
  const tigerWolvesId = tigerWolves.id as number

  // #331: MMER's own run_group so its Easy workout family is scoped to it
  // (fetchWorkoutVariants('mmer') resolves run_group_id = this id + global families).
  // Idempotent: try to insert, then select (exists or was just created).
  try {
    await sql`
      INSERT INTO run_groups (name, venue, default_location)
      VALUES ('MMER', 'road', 'McCarren Park')
    `
  } catch {
    // Row already exists; safe to ignore and proceed to SELECT
  }
  const [mmerGroup] = await sql`SELECT id FROM run_groups WHERE name = 'MMER'`
  const mmerGroupId = mmerGroup.id as number

  for (const f of FAMILIES) {
    const [family] = await sql`
      INSERT INTO workout_families (name, category, type, reason, author, run_group_id)
      VALUES (${f.name}, ${f.category}, ${f.type}, ${f.reason}, 'TigerWolves', ${tigerWolvesId})
      RETURNING id
    `
    const familyId = family.id as number
    for (const v of f.variants) {
      await sql`
        INSERT INTO workout_variants (family_id, label, sort_order, raw_input, has_turnaround, turnaround, flagged, flag_note)
        VALUES (${familyId}, ${v.label}, ${v.sortOrder}, ${v.rawInput}, false, '', ${v.flagged ?? false}, ${v.flagNote ?? ''})
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
      'tigerwolves', 'TigerWolves', '🐯🐺', 'Tuesday', '6:30 AM',
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
  // e2e. Maps from NBR_RUNS 'mon-morning-easy' via NBR_TO_DB_RUN.
  // #331: now a fully-realized Easy run — run_group_id set so its Easy workout
  // resolves, and a schedule + leader below — so My Week shows a real cross-run,
  // kind-driven (Easy/route) card alongside TigerWolves' Workout card.
  await sql`
    INSERT INTO runs (id, name, emoji, description, day_of_week, meeting_time, meeting_location, kind, run_group_id)
    VALUES (
      'mmer', 'Monday Morning Easy Run', '🌅',
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

  // Roster names match the schedule leaders below so rotation and away-period
  // reassignment resolve to real names. clerk_user_id is left NULL here on purpose:
  // the login is the source of truth for the leader link. e2e/auth.setup.ts reads the
  // real Clerk id from the signed-in session and stamps it onto the first row (Dana Kim),
  // so getLeaderRun() recognizes whatever account actually signs in — no dependency on a
  // hand-maintained id secret. away_periods/email take their column defaults.
  await sql`
    INSERT INTO run_leaders (run_id, name, sort_order, clerk_user_id, active) VALUES
      ('tigerwolves', 'Dana Kim',   1, NULL, true),
      ('tigerwolves', 'Marcus Ade', 2, NULL, true),
      ('tigerwolves', 'Priya Shah', 3, NULL, true)
  `
  // #331: MMER's leader — the "Led by" name on its My Week card. (R4 wires
  // foulox+mmer as MMER's signed-in owning leader; for R3 this is just a name.)
  await sql`
    INSERT INTO run_leaders (run_id, name, sort_order, clerk_user_id, active) VALUES
      ('mmer', 'Sam Rivera', 1, NULL, true)
  `

  // workout_type must match the assigned workout's own "type" field (not its
  // "category") — PlanClient's suggestion picker filters library workouts by
  // types.includes(w.type) against this column, so a mismatch here silently
  // empties the picker instead of erroring.
  await sql`
    INSERT INTO schedule (date, run_id, workout_type, leader, workout_name)
    VALUES (${week1}::date, 'tigerwolves', 'Interval', 'Dana Kim', 'Yasso 800s')
  `
  await sql`
    INSERT INTO schedule (date, run_id, workout_type, leader, workout_name)
    VALUES (${week2}::date, 'tigerwolves', 'Hills', 'Marcus Ade', 'Fort Greene Hills')
  `
  await sql`
    INSERT INTO schedule (date, run_id, workout_type, leader, workout_name)
    VALUES (${week3}::date, 'tigerwolves', 'Hills', 'Priya Shah', NULL)
  `
  // #331: MMER's next-Monday entry — inside the My Week default forward window, so
  // a follower sees it interleaved with TigerWolves' Tuesday. workout_type matches
  // the Easy family's own "type" (see note above).
  await sql`
    INSERT INTO schedule (date, run_id, workout_type, leader, workout_name)
    VALUES (${mon1}::date, 'mmer', 'Easy', 'Sam Rivera', 'McCarren Easy Loop')
  `

  for (const r of RACES) {
    await sql`
      INSERT INTO races (date, name, distance, location, organizer, verified, flagged, flag_note)
      VALUES (${r.date}::date, ${r.name}, ${r.distance}, ${r.location}, ${r.organizer}, ${r.verified}, ${r.flagged}, ${r.flagNote})
    `
  }

  console.log(`  seeded ${FAMILIES.length + 1} workout_families, 2 runs (tigerwolves + mmer) + 4 run_leaders, 4 schedule entries (tigerwolves: ${week1}, ${week2}, ${week3}; mmer: ${mon1}), ${RACES.length} races`)
}
