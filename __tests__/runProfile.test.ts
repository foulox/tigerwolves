import { describe, test, expect } from 'vitest'
import { resolveAllowedTypes, isWorkoutKind, WEEK_SLOTS, parseSlotValue, joinSlotValue } from '../lib/runProfile'

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
