import { neon } from '@neondatabase/serverless'
import { RUN_LEADERS, weekOfMonth } from '../lib/data'
import type { ScheduleEntry, Race } from '../lib/data'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set')

// This script is retired: it was the one-time Sheets -> Neon migration (#84),
// kept only as historical record of how the data was seeded. SHEETS_URL and the
// Apps Script deployment it called were removed in #86. Do not run this again.
const sheetsUrl = process.env.SHEETS_URL
if (!sheetsUrl) throw new Error('seed.ts is retired (see comment above) — SHEETS_URL no longer exists, do not run')

const sql = neon(url)

type RawRow = Record<string, unknown>

// Shape of one Sheets workout row, pre-grouping — mirrors the legacy `workouts`
// row fields this script originally wrote (#84), kept local now that the
// `workouts` table (and lib/data.ts's `Workout` type) is retired (#278).
type RawSeedWorkout = {
  name: string
  category: string
  type: string
  reason: string
  instructions: string
  distTime: string
  energySystem: string
  hrZone: string
  rpe: string
  coachingNotes: string | null
  mapLink: string | null
  variation: string
  progression: number | null
  author: string | null
  raceTypes: string[]
  trainingPhases: string[]
  hasTurnaround: boolean
}

function str(val: unknown): string {
  if (val === null || val === undefined || val === '[URL]') return ''
  return String(val).trim()
}

function normalizeDate(val: unknown): string | null {
  const s = str(val)
  return s.length >= 10 ? s.slice(0, 10) : null
}

function mapWorkout(row: RawRow): RawSeedWorkout {
  return {
    name: str(row['Workout Name']),
    category: str(row['Category']),
    type: str(row['Type']),
    reason: str(row['Reason / Purpose']),
    instructions: str(row['Instructions']),
    distTime: str(row['Dist/Time']),
    energySystem: str(row['Energy System']),
    hrZone: str(row['HR Zone']),
    rpe: str(row['RPE']),
    coachingNotes: str(row['Coaching Notes']) || null,
    mapLink: str(row['Map Link']) || null,
    variation: str(row['Variation']),
    progression: (() => { const n = parseInt(str(row['Progression'])); return isNaN(n) ? null : n })(),
    author: str(row['Author']) || null,
    raceTypes: str(row['Race Type']).split(',').map(s => s.trim()).filter(Boolean),
    trainingPhases: str(row['Training Phase']).split(',').map(s => s.trim()).filter(Boolean),
    hasTurnaround: str(row['hasTurnaround']) === 'TRUE',
  }
}

function mapScheduleEntry(row: RawRow): ScheduleEntry {
  const date = normalizeDate(row['Date']) ?? ''
  return {
    date,
    weekOfMonth: date ? weekOfMonth(date) : 0,
    workoutType: str(row['Workout Type']),
    leader: str(row['Leader']),
    workoutName: str(row['Workout Name']) || null,
    selectedVariations: [''],
  }
}

function mapRace(row: RawRow): Race {
  return {
    id: 0, // unused — the INSERT below only references date/name/distance/location
    date: normalizeDate(row['Date']) ?? '',
    name: str(row['Name']),
    distance: str(row['Distance']),
    location: str(row['Location']),
    organizer: '',
    verified: true,
    flagged: false,
    flagNote: '',
  }
}

// Rows sharing a `name` become one workout_families row with multiple
// workout_variants — same grouping rule the legacy `workouts` table applied
// implicitly (rows sharing a name were already treated as one family).
function groupByName(workouts: RawSeedWorkout[]): Map<string, RawSeedWorkout[]> {
  const byName = new Map<string, RawSeedWorkout[]>()
  for (const w of workouts) {
    const list = byName.get(w.name)
    if (list) list.push(w)
    else byName.set(w.name, [w])
  }
  return byName
}

async function main() {
  console.log('Fetching data from Google Sheets...')
  const res = await fetch(sheetsUrl!)
  if (!res.ok) throw new Error(`Sheets fetch failed: ${res.status}`)
  const json = await res.json() as { schedule: RawRow[], races: RawRow[], workouts: RawRow[] }

  const workouts = json.workouts.map(mapWorkout).filter(w => w.name)
  const schedule = json.schedule.map(mapScheduleEntry).filter(e => e.date)
  const races = json.races.map(mapRace).filter(r => r.date)
  const families = groupByName(workouts)

  console.log(`Seeding ${workouts.length} workouts across ${families.size} families, ${schedule.length} schedule entries, ${races.length} races, ${RUN_LEADERS.length} run leaders...`)

  const [tigerWolves] = await sql`SELECT id FROM run_groups WHERE name = 'TigerWolves'`
  if (!tigerWolves) {
    throw new Error("No 'TigerWolves' row in run_groups — run scripts/run-migrate.ts first (it seeds this row as part of #274's migration).")
  }
  const tigerWolvesId = tigerWolves.id as number

  // workout_families / workout_variants
  for (const [name, members] of families) {
    const rep = members[0]
    const [family] = await sql`
      INSERT INTO workout_families (name, category, type, reason, author, coaching_notes, map_link, run_group_id)
      VALUES (${name}, ${rep.category}, ${rep.type}, ${rep.reason}, ${rep.author}, ${rep.coachingNotes}, ${rep.mapLink}, ${tigerWolvesId})
      RETURNING id
    `
    const familyId = family.id as number
    for (const w of members) {
      await sql`
        INSERT INTO workout_variants (
          family_id, label, sort_order, raw_input, has_turnaround, turnaround,
          energy_system, hr_zone, rpe, dist_time, race_types, training_phases
        ) VALUES (
          ${familyId}, ${w.variation || null}, ${w.progression}, ${w.instructions}, ${w.hasTurnaround}, '',
          ${w.energySystem}, ${w.hrZone}, ${w.rpe}, ${w.distTime}, ${w.raceTypes}, ${w.trainingPhases}
        )
      `
    }
  }
  console.log(`  ✓ workout_families / workout_variants`)

  // schedule
  for (const e of schedule) {
    await sql.query(
      `INSERT INTO schedule (date, workout_type, leader, workout_name)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (date) DO NOTHING`,
      [e.date, e.workoutType, e.leader, e.workoutName]
    )
  }
  console.log(`  ✓ schedule`)

  // races
  for (const r of races) {
    await sql.query(
      `INSERT INTO races (date, name, distance, location)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (date, name) DO NOTHING`,
      [r.date, r.name, r.distance, r.location]
    )
  }
  console.log(`  ✓ races`)

  // run_leaders — seeded from RUN_LEADERS constant, TigerWolves run (run_id = 'tigerwolves')
  for (let i = 0; i < RUN_LEADERS.length; i++) {
    await sql.query(
      `INSERT INTO run_leaders (run_id, name, sort_order, active)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (run_id, name) DO NOTHING`,
      ['tigerwolves', RUN_LEADERS[i], i + 1, true]
    )
  }
  console.log(`  ✓ run_leaders`)

  // verify row counts
  const [fCount] = await sql`SELECT COUNT(*) AS n FROM workout_families`
  const [vCount] = await sql`SELECT COUNT(*) AS n FROM workout_variants`
  const [sCount] = await sql`SELECT COUNT(*) AS n FROM schedule`
  const [rCount] = await sql`SELECT COUNT(*) AS n FROM races`
  const [lCount] = await sql`SELECT COUNT(*) AS n FROM run_leaders`

  console.log('\nRow counts:')
  console.log(`  workout_families: ${fCount.n} (sheet: ${families.size})`)
  console.log(`  workout_variants: ${vCount.n} (sheet: ${workouts.length})`)
  console.log(`  schedule:         ${sCount.n} (sheet: ${schedule.length})`)
  console.log(`  races:            ${rCount.n} (sheet: ${races.length})`)
  console.log(`  run_leaders:      ${lCount.n} (constant: ${RUN_LEADERS.length})`)
  console.log('\nSeed complete.')
}

main().catch(err => { console.error(err); process.exit(1) })
