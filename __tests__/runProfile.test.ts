import { describe, test, expect } from 'vitest'
import { resolveAllowedTypes, isWorkoutKind } from '../lib/runProfile'

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
