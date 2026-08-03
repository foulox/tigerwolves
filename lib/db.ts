import { neon } from '@neondatabase/serverless'
import { unstable_cache } from 'next/cache'
import type { Workout, ScheduleEntry, Race } from './data'
import { weekOfMonth } from './data'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set')
}

export const sql = neon(process.env.DATABASE_URL)

function toDateString(val: unknown): string {
  if (!val) return ''
  if (val instanceof Date) return val.toISOString().slice(0, 10)
  return String(val).slice(0, 10)
}

// ── Reads ─────────────────────────────────────────────────────────────────────

export async function fetchWorkouts(): Promise<Workout[]> {
  const rows = await sql`
    SELECT * FROM workouts ORDER BY name, progression NULLS LAST
  `
  return rows.map((r) => ({
    name: r.name as string,
    sport: r.sport as string,
    category: r.category as string,
    type: r.type as string,
    reason: r.reason as string,
    instructions: r.instructions as string,
    distTime: r.dist_time as string,
    lapStructure: r.lap_structure as string,
    energySystem: r.energy_system as string,
    hrZone: r.hr_zone as string,
    rpe: r.rpe as string,
    lastRan: r.last_ran ? toDateString(r.last_ran) : null,
    coachingNotes: (r.coaching_notes as string | null) ?? null,
    mapLink: (r.map_link as string | null) ?? null,
    variation: r.variation as string,
    progression: (r.progression as number | null) ?? null,
    author: (r.author as string | null) ?? null,
    raceTypes: (r.race_types as string[]) ?? [],
    trainingPhases: (r.training_phases as string[]) ?? [],
    hasTurnaround: r.has_turnaround as boolean,
    turnaroundDistance: r.turnaround_distance as string,
    flagged: r.flagged as boolean,
    flagNote: r.flag_note as string,
  }))
}

export async function fetchSchedule(): Promise<ScheduleEntry[]> {
  const rows = await sql`
    SELECT * FROM schedule ORDER BY date ASC
  `
  return rows.map((r) => {
    const date = toDateString(r.date)
    return {
      date,
      weekOfMonth: weekOfMonth(date),
      workoutType: r.workout_type as string,
      leader: r.leader as string,
      workoutName: (r.workout_name as string | null) ?? null,
      selectedVariations: (r.selected_variations as string[]) ?? [''],
    }
  })
}

export async function fetchRaces(): Promise<Race[]> {
  const rows = await sql`
    SELECT * FROM races ORDER BY date ASC
  `
  return rows.map((r) => ({
    id: r.id as number,
    date: toDateString(r.date),
    name: r.name as string,
    distance: r.distance as string,
    location: r.location as string,
    organizer: r.organizer as string,
    verified: r.verified as boolean,
    flagged: r.flagged as boolean,
    flagNote: r.flag_note as string,
  }))
}

// ── Writes ────────────────────────────────────────────────────────────────────

export async function dbSetScheduleWorkout(date: string, workoutName: string, selectedVariations: string[]): Promise<void> {
  await sql`
    UPDATE schedule SET workout_name = ${workoutName}, selected_variations = ${selectedVariations} WHERE date = ${date}::date
  `
}

export async function dbInsertWorkout(w: Omit<Workout, 'lastRan'>): Promise<void> {
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

export async function dbUpdateWorkout(
  originalName: string,
  originalVariation: string,
  w: Omit<Workout, 'lastRan'>,
): Promise<void> {
  await sql`
    UPDATE workouts SET
      name = ${w.name},
      sport = ${w.sport},
      category = ${w.category},
      type = ${w.type},
      reason = ${w.reason},
      instructions = ${w.instructions},
      dist_time = ${w.distTime},
      lap_structure = ${w.lapStructure},
      energy_system = ${w.energySystem},
      hr_zone = ${w.hrZone},
      rpe = ${w.rpe},
      coaching_notes = ${w.coachingNotes},
      map_link = ${w.mapLink},
      variation = ${w.variation},
      progression = ${w.progression},
      author = ${w.author},
      race_types = ${w.raceTypes},
      training_phases = ${w.trainingPhases},
      has_turnaround = ${w.hasTurnaround},
      turnaround_distance = ${w.turnaroundDistance},
      flagged = ${w.flagged},
      flag_note = ${w.flagNote}
    WHERE name = ${originalName} AND variation = ${originalVariation}
  `
}

export async function dbDeleteWorkout(name: string, variation: string): Promise<void> {
  await sql`
    DELETE FROM workouts WHERE name = ${name} AND variation = ${variation}
  `
}

export async function dbFlagWorkout(name: string, variation: string, flagNote: string): Promise<void> {
  const rows = await sql`
    UPDATE workouts SET flagged = true, flag_note = ${flagNote}
    WHERE name = ${name} AND variation = ${variation}
    RETURNING name
  `
  if (rows.length === 0) throw new Error(`Workout ${name} (${variation}) not found`)
}

export async function dbFixWorkoutAndClearFlag(
  name: string,
  variation: string,
  fields: { reason: string; distTime: string; instructions: string },
): Promise<void> {
  const rows = await sql`
    UPDATE workouts SET
      reason = ${fields.reason},
      dist_time = ${fields.distTime},
      instructions = ${fields.instructions},
      flagged = false,
      flag_note = ''
    WHERE name = ${name} AND variation = ${variation}
    RETURNING name
  `
  if (rows.length === 0) throw new Error(`Workout ${name} (${variation}) not found`)
}

export async function dbInsertRace(race: Omit<Race, 'id'>): Promise<number> {
  const rows = await sql`
    INSERT INTO races (date, name, distance, location, organizer, verified, flagged, flag_note)
    VALUES (${race.date}::date, ${race.name}, ${race.distance}, ${race.location}, ${race.organizer}, ${race.verified}, ${race.flagged}, ${race.flagNote})
    RETURNING id
  `
  return rows[0].id as number
}

export async function dbFlagRace(id: number, flagNote: string): Promise<void> {
  const rows = await sql`
    UPDATE races SET flagged = true, flag_note = ${flagNote} WHERE id = ${id}
    RETURNING id
  `
  if (rows.length === 0) throw new Error(`Race ${id} not found`)
}

export async function dbVerifyRace(id: number): Promise<void> {
  const rows = await sql`
    UPDATE races SET verified = true WHERE id = ${id}
    RETURNING id
  `
  if (rows.length === 0) throw new Error(`Race ${id} not found`)
}

export async function dbFixRace(
  id: number,
  fields: { name: string; date: string; distance: string; location: string },
): Promise<void> {
  const rows = await sql`
    UPDATE races SET
      name = ${fields.name},
      date = ${fields.date}::date,
      distance = ${fields.distance},
      location = ${fields.location},
      verified = true,
      flagged = false,
      flag_note = ''
    WHERE id = ${id}
    RETURNING id
  `
  if (rows.length === 0) throw new Error(`Race ${id} not found`)
}

export async function dbRegroupFamily(
  newName: string,
  workouts: Array<{
    originalName: string
    originalVariation: string
    variation: string
    progression: number
  }>,
): Promise<void> {
  await sql.transaction(
    workouts.map(
      (w) => sql`
        UPDATE workouts
        SET name = ${newName}, variation = ${w.variation}, progression = ${w.progression}
        WHERE name = ${w.originalName} AND variation = ${w.originalVariation}
      `,
    ),
  )
}

// ── Aggregate read, cached ──────────────────────────────────────────────────

export const fetchData = unstable_cache(
  async () => {
    try {
      const [schedule, races, workouts] = await Promise.all([
        fetchSchedule(),
        fetchRaces(),
        fetchWorkouts(),
      ])
      return { schedule, races, workouts }
    } catch {
      return { schedule: [], races: [], workouts: [] }
    }
  },
  ['fetchData'],
  { revalidate: 300, tags: ['tigerwolves-data'] },
)
