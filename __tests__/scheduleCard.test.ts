import { describe, test, expect } from 'vitest'
import { resolveWorkoutVariant } from '../lib/scheduleUtils'
import type { WorkoutVariantRow } from '../lib/data'

function makeVariant(overrides: Partial<WorkoutVariantRow> = {}): WorkoutVariantRow {
  return {
    id: 1,
    familyId: 1,
    name: 'Test Workout',
    label: null,
    sortOrder: null,
    category: 'Quality',
    type: 'Broken Tempo',
    reason: 'Build lactate threshold',
    rawInput: 'WU 15min easy, main set, CD 10min easy',
    distTime: '8×(800m + 400m)',
    energySystem: 'Aerobic threshold',
    hrZone: 'Z3-Z4',
    rpe: '7',
    coachingNotes: null,
    mapLink: null,
    author: 'Lou',
    raceTypes: ['Half', 'Full'],
    trainingPhases: ['Build', 'Peak'],
    hasTurnaround: false,
    turnaround: '',
    flagged: false,
    flagNote: '',
    runGroupId: null,
    lastRan: null,
    ...overrides,
  }
}

describe('resolveWorkoutVariant', () => {
  test('standalone workout — returns it when name matches and label is null', () => {
    const variants = [makeVariant({ name: 'Gear Changers', label: null })]
    expect(resolveWorkoutVariant(variants, 'Gear Changers')).toBe(variants[0])
  })

  test('family-base-only — returns base (label=null) when only base exists', () => {
    const base = makeVariant({ name: 'Staircase', label: null })
    const variants = [base]
    expect(resolveWorkoutVariant(variants, 'Staircase')).toBe(base)
  })

  test('family-two-variations — returns base (label=null) and ignores named variants', () => {
    const base = makeVariant({ name: 'Ladder', label: null, sortOrder: null })
    const longer = makeVariant({ name: 'Ladder', label: 'Longer', sortOrder: 2 })
    const variants = [longer, base]
    const result = resolveWorkoutVariant(variants, 'Ladder')
    expect(result).toBe(base)
    expect(result?.label).toBeNull()
  })

  test('missing-workout — returns null when name not found in variants', () => {
    const variants = [makeVariant({ name: 'Other Workout', label: null })]
    expect(resolveWorkoutVariant(variants, 'Missing Workout')).toBeNull()
  })

  test('null workoutName — returns null without searching', () => {
    const variants = [makeVariant({ label: null })]
    expect(resolveWorkoutVariant(variants, null)).toBeNull()
  })

  test('no base row, no selected variation — falls back to lowest sort-order member', () => {
    const v1 = makeVariant({ name: 'Hills', label: '12x45s', sortOrder: 1 })
    const v2 = makeVariant({ name: 'Hills', label: '8x90s', sortOrder: 2 })
    // v2 listed first to confirm sort by sortOrder, not array order
    const result = resolveWorkoutVariant([v2, v1], 'Hills', [''])
    expect(result).toBe(v1)
  })

  test('no base row, selected variation present — returns the selected variation row', () => {
    const v1 = makeVariant({ name: 'Hills', label: '12x45s', sortOrder: 1 })
    const v2 = makeVariant({ name: 'Hills', label: '8x90s', sortOrder: 2 })
    const result = resolveWorkoutVariant([v1, v2], 'Hills', ['8x90s'])
    expect(result).toBe(v2)
  })

  test('base row present — always prefers base even when selected variation is named', () => {
    const base = makeVariant({ name: 'Broken Tempo', label: null, sortOrder: null })
    const longer = makeVariant({ name: 'Broken Tempo', label: 'Longer', sortOrder: 2 })
    const result = resolveWorkoutVariant([longer, base], 'Broken Tempo', ['Longer'])
    expect(result).toBe(base)
  })
})
