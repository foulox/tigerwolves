import { describe, it, expect, afterAll } from 'vitest'
import { sql, fetchWorkouts, fetchSchedule, fetchRaces, dbInsertWorkout, dbUpdateWorkout, dbDeleteWorkout, dbSetScheduleWorkout, dbRegroupFamily } from '../lib/db'

describe('database connection and schema', () => {
  it('connects to the database', async () => {
    const result = await sql`SELECT 1 AS ok`
    expect(result[0].ok).toBe(1)
  })

  it('workouts table exists with correct columns', async () => {
    const rows = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'workouts'
      ORDER BY column_name
    `
    const cols = rows.map((r) => r.column_name as string)
    expect(cols).toContain('id')
    expect(cols).toContain('name')
    expect(cols).toContain('variation')
    expect(cols).toContain('has_turnaround')
    expect(cols).toContain('race_types')
    expect(cols).toContain('training_phases')
  })

  it('schedule table has expected columns including selected_variations', async () => {
    const rows = await sql`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'schedule'
    `
    const cols = rows.map((r) => r.column_name as string)
    expect(cols).toContain('date')
    expect(cols).toContain('workout_name')
    expect(cols).toContain('selected_variations')
  })

  it('races table exists', async () => {
    const rows = await sql`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'races'
    `
    expect(rows.length).toBeGreaterThan(0)
  })

  it('run_leaders table exists', async () => {
    const rows = await sql`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'run_leaders'
    `
    expect(rows.length).toBeGreaterThan(0)
  })
})

describe('fetchWorkouts', () => {
  it('returns an array of workouts with expected shape', async () => {
    const workouts = await fetchWorkouts()
    expect(Array.isArray(workouts)).toBe(true)
    expect(workouts.length).toBeGreaterThan(0)
    const w = workouts[0]
    expect(typeof w.name).toBe('string')
    expect(typeof w.category).toBe('string')
    expect(typeof w.type).toBe('string')
    expect(Array.isArray(w.raceTypes)).toBe(true)
    expect(Array.isArray(w.trainingPhases)).toBe(true)
    expect(typeof w.hasTurnaround).toBe('boolean')
  })

  it('lastRan is null or a YYYY-MM-DD string', async () => {
    const workouts = await fetchWorkouts()
    for (const w of workouts) {
      if (w.lastRan !== null) {
        expect(w.lastRan).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      }
    }
  })
})

describe('fetchSchedule', () => {
  it('returns schedule entries with date and weekOfMonth', async () => {
    const entries = await fetchSchedule()
    expect(Array.isArray(entries)).toBe(true)
    expect(entries.length).toBeGreaterThan(0)
    const e = entries[0]
    expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(e.weekOfMonth).toBeGreaterThanOrEqual(1)
    expect(e.weekOfMonth).toBeLessThanOrEqual(5)
    expect(typeof e.leader).toBe('string')
    expect(typeof e.workoutType).toBe('string')
  })
})

describe('fetchRaces', () => {
  it('returns race entries with expected shape', async () => {
    const races = await fetchRaces()
    expect(Array.isArray(races)).toBe(true)
    expect(races.length).toBeGreaterThan(0)
    const r = races[0]
    expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(typeof r.name).toBe('string')
    expect(typeof r.distance).toBe('string')
  })
})

describe('workout mutations', () => {
  const TEST_NAME = '__test_workout__'
  const TEST_VARIATION = '__v1__'

  afterAll(async () => {
    await sql`DELETE FROM workouts WHERE name = ${TEST_NAME}`
  })

  it('inserts a workout and reads it back', async () => {
    await dbInsertWorkout({
      name: TEST_NAME,
      sport: 'Running',
      category: 'Quality',
      type: 'Hills',
      reason: 'Test',
      instructions: 'Run up',
      distTime: '30min',
      lapStructure: '',
      energySystem: '',
      hrZone: '',
      rpe: '7',
      coachingNotes: null,
      mapLink: null,
      variation: TEST_VARIATION,
      progression: 1,
      author: 'Test',
      raceTypes: ['5K', 'Half'],
      trainingPhases: ['Build'],
      hasTurnaround: true,
      turnaroundDistance: '15min',
    })
    const workouts = await fetchWorkouts()
    const inserted = workouts.find(w => w.name === TEST_NAME && w.variation === TEST_VARIATION)
    expect(inserted).toBeDefined()
    expect(inserted?.raceTypes).toContain('5K')
    expect(inserted?.hasTurnaround).toBe(true)
    expect(inserted?.progression).toBe(1)
  })

  it('updates a workout', async () => {
    await dbUpdateWorkout(TEST_NAME, TEST_VARIATION, {
      name: TEST_NAME,
      sport: 'Running',
      category: 'Quality',
      type: 'Hills',
      reason: 'Updated reason',
      instructions: 'Run up faster',
      distTime: '40min',
      lapStructure: '',
      energySystem: '',
      hrZone: '',
      rpe: '8',
      coachingNotes: 'Good one',
      mapLink: null,
      variation: TEST_VARIATION,
      progression: 2,
      author: 'Test',
      raceTypes: ['Full'],
      trainingPhases: ['Peak'],
      hasTurnaround: false,
      turnaroundDistance: '',
    })
    const workouts = await fetchWorkouts()
    const updated = workouts.find(w => w.name === TEST_NAME && w.variation === TEST_VARIATION)
    expect(updated?.reason).toBe('Updated reason')
    expect(updated?.rpe).toBe('8')
    expect(updated?.progression).toBe(2)
    expect(updated?.hasTurnaround).toBe(false)
  })

  it('renames a family via dbRegroupFamily', async () => {
    const NEW_NAME = '__test_renamed__'
    await dbRegroupFamily(NEW_NAME, [{
      originalName: TEST_NAME,
      originalVariation: TEST_VARIATION,
      variation: TEST_VARIATION,
      progression: 1,
    }])
    const workouts = await fetchWorkouts()
    const renamed = workouts.find(w => w.name === NEW_NAME && w.variation === TEST_VARIATION)
    expect(renamed).toBeDefined()
    // restore name for cleanup
    await sql`UPDATE workouts SET name = ${TEST_NAME} WHERE name = ${NEW_NAME}`
  })

  it('deletes a workout', async () => {
    await dbDeleteWorkout(TEST_NAME, TEST_VARIATION)
    const workouts = await fetchWorkouts()
    const gone = workouts.find(w => w.name === TEST_NAME && w.variation === TEST_VARIATION)
    expect(gone).toBeUndefined()
  })
})

describe('dbSetScheduleWorkout', () => {
  it('saves workout_name and a single variation (standalone)', async () => {
    const rows = await fetchSchedule()
    expect(rows.length).toBeGreaterThan(0)
    const target = rows[0]
    const originalName = target.workoutName
    const originalVariations = target.selectedVariations

    try {
      await dbSetScheduleWorkout(target.date, '__test_plan__', [''])
      const updated = await fetchSchedule()
      const row = updated.find(e => e.date === target.date)
      expect(row?.workoutName).toBe('__test_plan__')
      expect(row?.selectedVariations).toEqual([''])
    } finally {
      await sql`UPDATE schedule SET workout_name = ${originalName}, selected_variations = ${originalVariations} WHERE date = ${target.date}::date`
    }
  })

  it('saves two variations when Standard + Longer are both selected', async () => {
    const rows = await fetchSchedule()
    expect(rows.length).toBeGreaterThan(0)
    const target = rows[0]
    const originalName = target.workoutName
    const originalVariations = target.selectedVariations

    try {
      await dbSetScheduleWorkout(target.date, '__test_family__', ['', 'Longer — 6×4min @ LT'])
      const updated = await fetchSchedule()
      const row = updated.find(e => e.date === target.date)
      expect(row?.workoutName).toBe('__test_family__')
      expect(row?.selectedVariations).toEqual(['', 'Longer — 6×4min @ LT'])
    } finally {
      await sql`UPDATE schedule SET workout_name = ${originalName}, selected_variations = ${originalVariations} WHERE date = ${target.date}::date`
    }
  })

  it('overwrites to a single variation after previously saving two', async () => {
    const rows = await fetchSchedule()
    expect(rows.length).toBeGreaterThan(0)
    const target = rows[0]
    const originalName = target.workoutName
    const originalVariations = target.selectedVariations

    try {
      await dbSetScheduleWorkout(target.date, '__test_family__', ['', 'Longer'])
      await dbSetScheduleWorkout(target.date, '__test_standalone__', [''])
      const updated = await fetchSchedule()
      const row = updated.find(e => e.date === target.date)
      expect(row?.selectedVariations).toEqual([''])
    } finally {
      await sql`UPDATE schedule SET workout_name = ${originalName}, selected_variations = ${originalVariations} WHERE date = ${target.date}::date`
    }
  })
})
