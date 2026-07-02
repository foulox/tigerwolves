import { neon } from '@neondatabase/serverless'
import { mapWorkout, mapScheduleEntry, mapRace } from '../lib/sheets'
import { RUN_LEADERS } from '../lib/data'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set')

const sheetsUrl = process.env.SHEETS_URL
if (!sheetsUrl) throw new Error('SHEETS_URL is not set')

const sql = neon(url)

type RawRow = Record<string, unknown>

async function main() {
  console.log('Fetching data from Google Sheets...')
  const res = await fetch(sheetsUrl!)
  if (!res.ok) throw new Error(`Sheets fetch failed: ${res.status}`)
  const json = await res.json() as { schedule: RawRow[], races: RawRow[], workouts: RawRow[] }

  const workouts = json.workouts.map(mapWorkout).filter(w => w.name)
  const schedule = json.schedule.map(mapScheduleEntry).filter(e => e.date)
  const races = json.races.map(mapRace).filter(r => r.date)

  console.log(`Seeding ${workouts.length} workouts, ${schedule.length} schedule entries, ${races.length} races, ${RUN_LEADERS.length} run leaders...`)

  // workouts
  for (const w of workouts) {
    await sql.query(
      `INSERT INTO workouts
        (name, sport, category, type, reason, instructions, dist_time, lap_structure,
         energy_system, hr_zone, rpe, last_ran, coaching_notes, map_link, variation,
         progression, author, race_types, training_phases, has_turnaround, turnaround_distance)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       ON CONFLICT (name, variation) DO NOTHING`,
      [
        w.name, w.sport, w.category, w.type, w.reason, w.instructions,
        w.distTime, w.lapStructure, w.energySystem, w.hrZone, w.rpe,
        w.lastRan || null, w.coachingNotes, w.mapLink, w.variation,
        w.progression, w.author, w.raceTypes, w.trainingPhases,
        w.hasTurnaround, w.turnaroundDistance,
      ]
    )
  }
  console.log(`  ✓ workouts`)

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
  const [wCount] = await sql`SELECT COUNT(*) AS n FROM workouts`
  const [sCount] = await sql`SELECT COUNT(*) AS n FROM schedule`
  const [rCount] = await sql`SELECT COUNT(*) AS n FROM races`
  const [lCount] = await sql`SELECT COUNT(*) AS n FROM run_leaders`

  console.log('\nRow counts:')
  console.log(`  workouts:    ${wCount.n} (sheet: ${workouts.length})`)
  console.log(`  schedule:    ${sCount.n} (sheet: ${schedule.length})`)
  console.log(`  races:       ${rCount.n} (sheet: ${races.length})`)
  console.log(`  run_leaders: ${lCount.n} (constant: ${RUN_LEADERS.length})`)
  console.log('\nSeed complete.')
}

main().catch(err => { console.error(err); process.exit(1) })
