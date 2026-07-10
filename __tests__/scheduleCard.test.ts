import { describe, test, expect } from 'vitest'
import { resolveWorkout } from '../lib/scheduleUtils'
import type { Workout } from '../lib/data'

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return {
    name: 'Test Workout',
    sport: 'Running',
    category: 'Quality',
    type: 'Broken Tempo',
    reason: 'Build lactate threshold',
    instructions: 'WU 15min easy, main set, CD 10min easy',
    distTime: '8×(800m + 400m)',
    lapStructure: '800m @ LT, 400m rec',
    energySystem: 'Aerobic threshold',
    hrZone: 'Z3-Z4',
    rpe: '7',
    lastRan: null,
    coachingNotes: null,
    mapLink: null,
    variation: '',
    progression: null,
    author: 'Lou',
    raceTypes: ['Half', 'Full'],
    trainingPhases: ['Build', 'Peak'],
    hasTurnaround: false,
    turnaroundDistance: '',
    ...overrides,
  }
}

describe('resolveWorkout', () => {
  test('standalone workout — returns it when name matches and variation is empty string', () => {
    const workouts = [makeWorkout({ name: 'Gear Changers', variation: '' })]
    expect(resolveWorkout(workouts, 'Gear Changers')).toBe(workouts[0])
  })

  test('family-base-only — returns base (variation="") when only base exists', () => {
    const base = makeWorkout({ name: 'Staircase', variation: '' })
    const workouts = [base]
    expect(resolveWorkout(workouts, 'Staircase')).toBe(base)
  })

  test('family-two-variations — returns base (variation="") and ignores named variants', () => {
    const base = makeWorkout({ name: 'Ladder', variation: '', progression: null })
    const longer = makeWorkout({ name: 'Ladder', variation: 'Longer', progression: 2 })
    const workouts = [longer, base]
    const result = resolveWorkout(workouts, 'Ladder')
    expect(result).toBe(base)
    expect(result?.variation).toBe('')
  })

  test('missing-workout — returns null when name not found in workouts', () => {
    const workouts = [makeWorkout({ name: 'Other Workout', variation: '' })]
    expect(resolveWorkout(workouts, 'Missing Workout')).toBeNull()
  })

  test('null workoutName — returns null without searching', () => {
    const workouts = [makeWorkout({ variation: '' })]
    expect(resolveWorkout(workouts, null)).toBeNull()
  })

  test('family with no base variation — returns null when all entries have named variations', () => {
    const workouts = [
      makeWorkout({ name: 'Hills', variation: 'Short' }),
      makeWorkout({ name: 'Hills', variation: 'Long' }),
    ]
    expect(resolveWorkout(workouts, 'Hills')).toBeNull()
  })
})
