import { describe, test, expect } from 'vitest'
import { resolveAllowedTypes, isWorkoutKind, WEEK_SLOTS, parseSlotValue, joinSlotValue, kindToCategory, isRouteAdoptable, adoptableRunsFor } from '../lib/runProfile'

describe('resolveAllowedTypes', () => {
  test('intersects present types with the allowlist, sorted', () => {
    expect(resolveAllowedTypes(['Hills', 'Ladder', 'Threshold'], ['Hills', 'Threshold'])).toEqual(['Hills', 'Threshold'])
  })

  test('falls back to present types when the allowlist is empty', () => {
    expect(resolveAllowedTypes(['Hills', 'Ladder'], [])).toEqual(['Hills', 'Ladder'])
  })

  test('drops allowlist entries not present in the library', () => {
    expect(resolveAllowedTypes(['Hills'], ['Hills', 'Intervals'])).toEqual(['Hills'])
  })

  test('dedupes repeated present types', () => {
    expect(resolveAllowedTypes(['Hills', 'Hills', 'Ladder'], [])).toEqual(['Hills', 'Ladder'])
  })
})

describe('isWorkoutKind', () => {
  test('is true only for the Workout kind', () => {
    expect(isWorkoutKind('Workout')).toBe(true)
  })

  test('is false for non-workout kinds', () => {
    expect(isWorkoutKind('Easy')).toBe(false)
    expect(isWorkoutKind('Long')).toBe(false)
    expect(isWorkoutKind('Beginner-Friendly')).toBe(false)
    expect(isWorkoutKind('Food')).toBe(false)
  })
})

describe('week-of-month cycle slots', () => {
  test('WEEK_SLOTS covers the 1st–5th occurrence of the run day', () => {
    expect([...WEEK_SLOTS]).toEqual([1, 2, 3, 4, 5])
  })

  test('joinSlotValue joins selected types with " or "', () => {
    expect(joinSlotValue(['Ladder', 'Superset'])).toBe('Ladder or Superset')
    expect(joinSlotValue(['Hills'])).toBe('Hills')
    expect(joinSlotValue([])).toBe('')
  })

  test('parseSlotValue splits a slot into its component types', () => {
    expect(parseSlotValue('Ladder or Superset')).toEqual(['Ladder', 'Superset'])
    expect(parseSlotValue('Hills')).toEqual(['Hills'])
  })

  test('parseSlotValue trims whitespace and drops empty parts', () => {
    expect(parseSlotValue('  Ladder  or  Superset ')).toEqual(['Ladder', 'Superset'])
    expect(parseSlotValue('')).toEqual([])
    expect(parseSlotValue('Hills or ')).toEqual(['Hills'])
  })

  test('parse/join round-trip is stable', () => {
    const types = ['Ladder', 'Superset']
    expect(parseSlotValue(joinSlotValue(types))).toEqual(types)
  })
})

describe('kindToCategory', () => {
  test('maps Workout to Quality', () => {
    expect(kindToCategory('Workout')).toBe('Quality')
  })

  test('maps Easy to Easy', () => {
    expect(kindToCategory('Easy')).toBe('Easy')
  })

  test('maps Long to Long', () => {
    expect(kindToCategory('Long')).toBe('Long')
  })

  test('maps Beginner-Friendly to Easy', () => {
    expect(kindToCategory('Beginner-Friendly')).toBe('Easy')
  })

  test('maps Food to null', () => {
    expect(kindToCategory('Food')).toBe(null)
  })

  test('maps unknown kind to null', () => {
    expect(kindToCategory('SomethingUnknown')).toBe(null)
  })
})

describe('isRouteAdoptable', () => {
  test('Workout run with matching allowlist and matching type → adoptable', () => {
    expect(isRouteAdoptable({ category: 'Quality', type: 'Hills' }, { kind: 'Workout', workoutTypes: ['Hills', 'Threshold'] })).toBe(true)
  })

  test('Workout run with allowlist that excludes the workout type → not adoptable', () => {
    expect(isRouteAdoptable({ category: 'Quality', type: 'Intervals' }, { kind: 'Workout', workoutTypes: ['Hills', 'Threshold'] })).toBe(false)
  })

  test('Workout run with empty allowlist → any Quality type is adoptable', () => {
    expect(isRouteAdoptable({ category: 'Quality', type: 'Intervals' }, { kind: 'Workout', workoutTypes: [] })).toBe(true)
  })

  test('Workout run rejects non-Quality category even when type matches allowlist', () => {
    expect(isRouteAdoptable({ category: 'Easy', type: 'Easy' }, { kind: 'Workout', workoutTypes: ['Hills'] })).toBe(false)
  })

  test('Long run accepts a Long-category workout', () => {
    expect(isRouteAdoptable({ category: 'Long', type: 'Long' }, { kind: 'Long', workoutTypes: [] })).toBe(true)
  })

  test('Long run rejects a Quality-category workout', () => {
    expect(isRouteAdoptable({ category: 'Quality', type: 'Hills' }, { kind: 'Long', workoutTypes: [] })).toBe(false)
  })

  test('Easy run accepts an Easy-category workout', () => {
    expect(isRouteAdoptable({ category: 'Easy', type: 'Easy' }, { kind: 'Easy', workoutTypes: [] })).toBe(true)
  })

  test('Beginner-Friendly run accepts an Easy-category workout (maps to Easy)', () => {
    expect(isRouteAdoptable({ category: 'Easy', type: 'Easy' }, { kind: 'Beginner-Friendly', workoutTypes: [] })).toBe(true)
  })

  test('Easy run rejects a Long-category workout', () => {
    expect(isRouteAdoptable({ category: 'Long', type: 'Long' }, { kind: 'Easy', workoutTypes: [] })).toBe(false)
  })

  test('Food run rejects a Long-category workout (Food maps to null)', () => {
    expect(isRouteAdoptable({ category: 'Long', type: 'Long' }, { kind: 'Food', workoutTypes: [] })).toBe(false)
  })

  test('Food run rejects a Quality-category workout', () => {
    expect(isRouteAdoptable({ category: 'Quality', type: 'Hills' }, { kind: 'Food', workoutTypes: [] })).toBe(false)
  })
})

describe('adoptableRunsFor', () => {
  const workoutRun = { id: 'tw', name: 'TigerWolves', kind: 'Workout', workoutTypes: ['Hills', 'Threshold'] }
  const longRun = { id: 'lr', name: 'Long Runners', kind: 'Long', workoutTypes: [] }
  const easyRun = { id: 'er', name: 'Easy Runners', kind: 'Easy', workoutTypes: [] }
  const ledRuns = [workoutRun, longRun, easyRun]

  test('AC1: a workout that fits none of the led runs returns empty array', () => {
    // Quality/Hills fits only Workout runs — Long and Easy runs reject it
    expect(adoptableRunsFor({ category: 'Quality', type: 'Hills' }, [longRun, easyRun])).toEqual([])
  })

  test('AC2: mixed ledRuns — returns only adoptable ones, preserving order', () => {
    // Quality/Hills fits only workoutRun (Workout kind, Hills in allowlist)
    expect(adoptableRunsFor({ category: 'Quality', type: 'Hills' }, ledRuns)).toEqual([workoutRun])
  })

  test('AC2: a Long workout fits only the Long run in a mixed array', () => {
    expect(adoptableRunsFor({ category: 'Long', type: 'Long' }, ledRuns)).toEqual([longRun])
  })

  test('AC2: an Easy workout fits only the Easy run in a mixed array', () => {
    expect(adoptableRunsFor({ category: 'Easy', type: 'Easy' }, ledRuns)).toEqual([easyRun])
  })

  test('a Quality workout with a type not in the Workout allowlist returns empty', () => {
    expect(adoptableRunsFor({ category: 'Quality', type: 'Intervals' }, [workoutRun])).toEqual([])
  })

  test('a Workout run with empty allowlist accepts any Quality type', () => {
    const openWorkoutRun = { id: 'tw2', name: 'Open Workout', kind: 'Workout', workoutTypes: [] }
    expect(adoptableRunsFor({ category: 'Quality', type: 'Intervals' }, [openWorkoutRun])).toEqual([openWorkoutRun])
  })
})
