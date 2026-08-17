import { neon } from '@neondatabase/serverless'
import { unstable_cache } from 'next/cache'
import type { Workout, ScheduleEntry, Race, RunGroup, WorkoutVariantRow } from './data'
import { weekOfMonth } from './data'
import type { WorkoutVariantInput } from './workoutVariant'

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

// Joins workout_variants + workout_families + run_groups (#276) — the read-side
// counterpart to dbInsertWorkoutVariant/dbUpdateWorkoutVariant (#274). Scoped to
// this app's own run group (TigerWolves) plus global/unowned families, same as
// the implicit scope the legacy `workouts` table always had (no run_group concept
// there at all) — this app doesn't yet serve any other run group's workouts.
export async function fetchWorkoutVariants(): Promise<WorkoutVariantRow[]> {
  const rows = await sql`
    SELECT
      wv.id AS variant_id,
      wv.family_id,
      wf.name,
      wv.label,
      wv.sort_order,
      wf.category,
      wf.type,
      wf.reason,
      wv.raw_input,
      wv.dist_time,
      wv.energy_system,
      wv.hr_zone,
      wv.rpe,
      wf.coaching_notes,
      wf.map_link,
      wf.author,
      wv.race_types,
      wv.training_phases,
      wv.has_turnaround,
      wv.turnaround,
      wv.flagged,
      wv.flag_note,
      wf.run_group_id
    FROM workout_variants wv
    JOIN workout_families wf ON wf.id = wv.family_id
    LEFT JOIN run_groups rg ON rg.id = wf.run_group_id
    WHERE wf.run_group_id IS NULL OR rg.name = 'TigerWolves'
    ORDER BY wf.name, wv.sort_order NULLS LAST
  `
  return rows.map((r) => ({
    id: r.variant_id as number,
    familyId: r.family_id as number,
    name: r.name as string,
    label: (r.label as string | null) ?? null,
    sortOrder: (r.sort_order as number | null) ?? null,
    category: r.category as string,
    type: r.type as string,
    reason: (r.reason as string | null) ?? '',
    rawInput: r.raw_input as string,
    distTime: (r.dist_time as string | null) ?? '',
    energySystem: (r.energy_system as string | null) ?? '',
    hrZone: (r.hr_zone as string | null) ?? '',
    rpe: (r.rpe as string | null) ?? '',
    coachingNotes: (r.coaching_notes as string | null) ?? null,
    mapLink: (r.map_link as string | null) ?? null,
    author: (r.author as string | null) ?? null,
    raceTypes: (r.race_types as string[]) ?? [],
    trainingPhases: (r.training_phases as string[]) ?? [],
    hasTurnaround: r.has_turnaround as boolean,
    turnaround: (r.turnaround as string | null) ?? '',
    flagged: r.flagged as boolean,
    flagNote: r.flag_note as string,
    runGroupId: (r.run_group_id as number | null) ?? null,
    lastRan: null,
  }))
}

export async function fetchRunGroups(): Promise<RunGroup[]> {
  const rows = await sql`
    SELECT * FROM run_groups ORDER BY name
  `
  return rows.map((r) => ({
    id: r.id as number,
    name: r.name as string,
    venue: r.venue as string,
    defaultLocation: (r.default_location as string | null) ?? null,
  }))
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

// Thrown when a (name, variation) match fails — distinguishable from other
// DB errors so callers can tell "this workout moved" (e.g. renamed via
// dbRegroupFamily between page load and submit) from an unexpected failure.
export class WorkoutNotFoundError extends Error {
  constructor(name: string, variation: string) {
    super(`Workout ${name} (${variation}) not found`)
    this.name = 'WorkoutNotFoundError'
  }
}

export async function dbFlagWorkout(name: string, variation: string, flagNote: string): Promise<void> {
  const rows = await sql`
    UPDATE workouts SET flagged = true, flag_note = ${flagNote}
    WHERE name = ${name} AND variation = ${variation}
    RETURNING name
  `
  if (rows.length === 0) throw new WorkoutNotFoundError(name, variation)
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
  if (rows.length === 0) throw new WorkoutNotFoundError(name, variation)
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

// ── New schema writes (#274) ────────────────────────────────────────────────
// workout_families / workout_variants, additive alongside the legacy `workouts`
// table (which stays in place until cutover story #278). Only AddWorkoutForm
// writes here today; dbUpdateWorkoutVariant has no call site yet — editing is
// blocked for every workout reachable today, since none have a variant row
// until #275's backfill runs. It exists now because #276/#277's read-path
// rewire will need it.

export class WorkoutVariantNotFoundError extends Error {
  constructor(variantId: number) {
    super(`Workout variant ${variantId} not found`)
    this.name = 'WorkoutVariantNotFoundError'
  }
}

export async function dbInsertWorkoutVariant(
  w: WorkoutVariantInput,
): Promise<{ familyId: number; variantId: number }> {
  const [family] = await sql`
    INSERT INTO workout_families (name, category, type, reason, author, coaching_notes, map_link, run_group_id)
    VALUES (${w.name}, ${w.category}, ${w.type}, ${w.reason}, ${w.author}, ${w.coachingNotes}, ${w.mapLink}, ${w.runGroupId})
    RETURNING id
  `
  const familyId = family.id as number

  try {
    const [variant] = await sql`
      INSERT INTO workout_variants (
        family_id, label, sort_order, raw_input, has_turnaround, turnaround,
        energy_system, hr_zone, rpe, dist_time, race_types, training_phases
      ) VALUES (
        ${familyId}, NULL, NULL, ${w.instructions}, ${w.hasTurnaround}, ${w.turnaround},
        ${w.energySystem}, ${w.hrZone}, ${w.rpe}, ${w.distTime}, ${w.raceTypes}, ${w.trainingPhases}
      )
      RETURNING id
    `
    return { familyId, variantId: variant.id as number }
  } catch (err) {
    // Two sequential HTTP calls, not a single transaction (the neon serverless
    // driver's .transaction() only supports independent queries, not one that
    // depends on the previous query's result) — clean up the orphaned family
    // row by hand if the variant insert fails. Swallow a rollback failure
    // rather than let it replace `err` — the caller needs to know the variant
    // insert failed, not that the best-effort cleanup afterward also failed.
    await sql`DELETE FROM workout_families WHERE id = ${familyId}`.catch(() => {})
    throw err
  }
}

export async function dbUpdateWorkoutVariant(variantId: number, w: WorkoutVariantInput): Promise<void> {
  const [variant] = await sql`SELECT family_id FROM workout_variants WHERE id = ${variantId}`
  if (!variant) throw new WorkoutVariantNotFoundError(variantId)
  const familyId = variant.family_id as number

  await sql`
    UPDATE workout_families SET
      name = ${w.name},
      category = ${w.category},
      type = ${w.type},
      reason = ${w.reason},
      author = ${w.author},
      coaching_notes = ${w.coachingNotes},
      map_link = ${w.mapLink},
      run_group_id = ${w.runGroupId}
    WHERE id = ${familyId}
  `
  await sql`
    UPDATE workout_variants SET
      raw_input = ${w.instructions},
      has_turnaround = ${w.hasTurnaround},
      turnaround = ${w.turnaround},
      energy_system = ${w.energySystem},
      hr_zone = ${w.hrZone},
      rpe = ${w.rpe},
      dist_time = ${w.distTime},
      race_types = ${w.raceTypes},
      training_phases = ${w.trainingPhases}
    WHERE id = ${variantId}
  `
}

// ── Aggregate read, cached ──────────────────────────────────────────────────

export const fetchData = unstable_cache(
  async () => {
    // Isolated from the Promise.all below: a workout_variants/workout_families
    // query failure (e.g. a Preview branch where the migration hasn't run yet —
    // has happened twice before, #238/#272) shouldn't blank out schedule/races/
    // legacy workouts too, which have nothing to do with this table.
    let workoutVariants: WorkoutVariantRow[] = []
    try {
      workoutVariants = await fetchWorkoutVariants()
    } catch {
      workoutVariants = []
    }
    try {
      const [schedule, races, workouts] = await Promise.all([
        fetchSchedule(),
        fetchRaces(),
        fetchWorkouts(),
      ])
      return { schedule, races, workouts, workoutVariants }
    } catch {
      return { schedule: [], races: [], workouts: [], workoutVariants }
    }
  },
  ['fetchData'],
  { revalidate: 300, tags: ['tigerwolves-data'] },
)
