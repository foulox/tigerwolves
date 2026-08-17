import { neon } from '@neondatabase/serverless'
import type { Workout, Race } from '../lib/data'

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

/** N days from today, as YYYY-MM-DD — used for race dates, which don't need to fall on a Tuesday. */
function daysFromNow(days: number): string {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function baseWorkout(overrides: Partial<Omit<Workout, 'lastRan'>> & Pick<Omit<Workout, 'lastRan'>, 'name' | 'category' | 'type'>): Omit<Workout, 'lastRan'> {
  return {
    sport: 'Run',
    reason: 'E2E fixture workout.',
    instructions: 'Fixture instructions — seeded by scripts/seed-e2e.ts.',
    distTime: '4 mi',
    lapStructure: '',
    energySystem: '',
    hrZone: '',
    rpe: '',
    coachingNotes: null,
    mapLink: null,
    variation: '',
    progression: null,
    author: 'TigerWolves',
    raceTypes: [],
    trainingPhases: [],
    hasTurnaround: false,
    turnaroundDistance: '',
    flagged: false,
    flagNote: '',
    ...overrides,
  }
}

const WORKOUTS: Omit<Workout, 'lastRan'>[] = [
  baseWorkout({ name: 'Easy Recovery Run', category: 'Easy', type: 'Recovery' }),
  baseWorkout({ name: 'Long Run — Progressive', category: 'Long', type: 'Progressive' }),
  baseWorkout({
    name: 'Yasso 800s', category: 'Quality', type: 'Interval',
    instructions: '10x800m @ 5K effort, 400m jog recovery.',
    flagged: true, flagNote: "We've actually been running 8 reps lately, not 10 — might be worth double-checking.",
  }),
  baseWorkout({ name: 'Fort Greene Hills', category: 'Quality', type: 'Hills', instructions: '8x90sec hill repeats, jog down recovery.' }),
  baseWorkout({ name: 'Prospect Park Tempo', category: 'Quality', type: 'Straight Tempo', instructions: '20min @ tempo effort around the loop.' }),
  baseWorkout({ name: 'Track Ladder 400-800-1200', category: 'Quality', type: 'Ladder', instructions: '400-800-1200-800-400 @ 5K effort, equal jog recovery.' }),
  baseWorkout({ name: 'McCarren Loop Repeats', category: 'Quality', type: 'Interval', variation: 'Short loop, 6x800m', progression: 1 }),
  baseWorkout({ name: 'McCarren Loop Repeats', category: 'Quality', type: 'Interval', variation: 'Long loop, 4x1200m', progression: 2 }),
]

const RACES: Omit<Race, 'id'>[] = [
  { date: '', name: 'Brooklyn Half Marathon', distance: '13.1mi', location: 'Prospect Park, Brooklyn', organizer: 'NYRR', verified: true, flagged: false, flagNote: '' },
  { date: '', name: 'Prospect Park 5K Series #3', distance: '5K', location: 'Prospect Park, Brooklyn', organizer: 'NBR', verified: false, flagged: true, flagNote: "Date TBD — organizer hasn't confirmed" },
]

// #276: PlanClient now reads workout_families/workout_variants, not the legacy
// `workouts` table above — mirror the same Quality-category fixtures into the
// new schema too, or plan.spec.ts's Plan-screen assertions have nothing to
// find. Kept as a second, parallel fixture set rather than derived from
// WORKOUTS above: the legacy rows still back schedule.spec.ts/library.spec.ts/
// admin.spec.ts, which stay on the legacy table until #277 — the two schemas
// aren't the same shape (no override-text field on workout_variants; label is
// a short tag, not post content), so a shared source would just paper over that.
type VariantFixture = {
  label: string | null
  sortOrder: number | null
  rawInput: string
}

type FamilyFixture = {
  name: string
  type: string
  reason: string
  variants: VariantFixture[]
}

const FAMILIES: FamilyFixture[] = [
  {
    name: 'Yasso 800s', type: 'Interval', reason: 'E2E fixture workout.',
    variants: [{ label: null, sortOrder: null, rawInput: '10x800m @ 5K effort, 400m jog recovery.' }],
  },
  {
    name: 'Fort Greene Hills', type: 'Hills', reason: 'E2E fixture workout.',
    variants: [{ label: null, sortOrder: null, rawInput: '8x90sec hill repeats, jog down recovery.' }],
  },
  {
    name: 'Prospect Park Tempo', type: 'Straight Tempo', reason: 'E2E fixture workout.',
    variants: [{ label: null, sortOrder: null, rawInput: '20min @ tempo effort around the loop.' }],
  },
  {
    name: 'Track Ladder 400-800-1200', type: 'Ladder', reason: 'E2E fixture workout.',
    variants: [{ label: null, sortOrder: null, rawInput: '400-800-1200-800-400 @ 5K effort, equal jog recovery.' }],
  },
  {
    name: 'McCarren Loop Repeats', type: 'Interval', reason: 'E2E fixture workout.',
    variants: [
      { label: 'Short loop, 6x800m', sortOrder: 1, rawInput: 'Short loop, 6x800m' },
      { label: 'Long loop, 4x1200m', sortOrder: 2, rawInput: 'Long loop, 4x1200m' },
    ],
  },
]

export async function seedE2E(): Promise<void> {
  const [week1, week2, week3] = nextTuesdays(3)
  RACES[0].date = daysFromNow(10)
  RACES[1].date = daysFromNow(24)

  console.log(`Seeding e2e fixtures against ${url!.split('@')[1]}...`)

  // Wipe in FK-safe order, then reinsert.
  await sql`DELETE FROM schedule`
  await sql`DELETE FROM races`
  await sql`DELETE FROM workouts`
  await sql`DELETE FROM workout_variants`
  await sql`DELETE FROM workout_families`

  const [tigerWolves] = await sql`SELECT id FROM run_groups WHERE name = 'TigerWolves'`
  if (!tigerWolves) {
    throw new Error(
      "No 'TigerWolves' row in run_groups — run scripts/run-migrate.ts first (it seeds this row as part of #274's migration)."
    )
  }
  const tigerWolvesId = tigerWolves.id as number

  for (const f of FAMILIES) {
    const [family] = await sql`
      INSERT INTO workout_families (name, category, type, reason, author, run_group_id)
      VALUES (${f.name}, 'Quality', ${f.type}, ${f.reason}, 'TigerWolves', ${tigerWolvesId})
      RETURNING id
    `
    const familyId = family.id as number
    for (const v of f.variants) {
      await sql`
        INSERT INTO workout_variants (family_id, label, sort_order, raw_input, has_turnaround, turnaround)
        VALUES (${familyId}, ${v.label}, ${v.sortOrder}, ${v.rawInput}, false, '')
      `
    }
  }

  for (const w of WORKOUTS) {
    await sql`
      INSERT INTO workouts (
        name, sport, category, type, reason, instructions, dist_time,
        lap_structure, energy_system, hr_zone, rpe, last_ran, coaching_notes,
        map_link, variation, progression, author, race_types, training_phases,
        has_turnaround, turnaround_distance, flagged, flag_note
      ) VALUES (
        ${w.name}, ${w.sport}, ${w.category}, ${w.type}, ${w.reason},
        ${w.instructions}, ${w.distTime}, ${w.lapStructure}, ${w.energySystem},
        ${w.hrZone}, ${w.rpe}, NULL, ${w.coachingNotes}, ${w.mapLink},
        ${w.variation}, ${w.progression}, ${w.author},
        ${w.raceTypes}, ${w.trainingPhases},
        ${w.hasTurnaround}, ${w.turnaroundDistance}, ${w.flagged}, ${w.flagNote}
      )
    `
  }

  // workout_type must match the assigned workout's own "type" field (not its
  // "category") — PlanClient's suggestion picker filters library workouts by
  // types.includes(w.type) against this column, so a mismatch here silently
  // empties the picker instead of erroring.
  await sql`
    INSERT INTO schedule (date, workout_type, leader, workout_name)
    VALUES (${week1}::date, 'Interval', 'Dana Kim', 'Yasso 800s')
  `
  await sql`
    INSERT INTO schedule (date, workout_type, leader, workout_name)
    VALUES (${week2}::date, 'Hills', 'Marcus Ade', 'Fort Greene Hills')
  `
  await sql`
    INSERT INTO schedule (date, workout_type, leader, workout_name)
    VALUES (${week3}::date, 'Hills', 'Priya Shah', NULL)
  `

  for (const r of RACES) {
    await sql`
      INSERT INTO races (date, name, distance, location, organizer, verified, flagged, flag_note)
      VALUES (${r.date}::date, ${r.name}, ${r.distance}, ${r.location}, ${r.organizer}, ${r.verified}, ${r.flagged}, ${r.flagNote})
    `
  }

  console.log(`  seeded ${WORKOUTS.length} workouts, ${FAMILIES.length} workout_families, 3 schedule entries (${week1}, ${week2}, ${week3}), ${RACES.length} races`)
}
