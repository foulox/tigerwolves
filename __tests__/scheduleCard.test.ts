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

  test('no base row, no selected variation — falls back to lowest progression member', () => {
    const v1 = makeWorkout({ name: 'Hills', variation: '12x45s', progression: 1 })
    const v2 = makeWorkout({ name: 'Hills', variation: '8x90s', progression: 2 })
    // v2 listed first to confirm sort by progression, not array order
    const result = resolveWorkout([v2, v1], 'Hills', [''])
    expect(result).toBe(v1)
  })

  test('no base row, selected variation present — returns the selected variation row', () => {
    const v1 = makeWorkout({ name: 'Hills', variation: '12x45s', progression: 1 })
    const v2 = makeWorkout({ name: 'Hills', variation: '8x90s', progression: 2 })
    const result = resolveWorkout([v1, v2], 'Hills', ['8x90s'])
    expect(result).toBe(v2)
  })

  test('base row present — always prefers base even when selected variation is named', () => {
    const base = makeWorkout({ name: 'Broken Tempo', variation: '', progression: null })
    const longer = makeWorkout({ name: 'Broken Tempo', variation: 'Longer', progression: 2 })
    const result = resolveWorkout([longer, base], 'Broken Tempo', ['Longer'])
    expect(result).toBe(base)
  })
})
