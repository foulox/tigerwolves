import { describe, test, expect } from 'vitest'
import { findCollidingFamily, toggleItem, typesForCategory } from '../lib/workoutForm'

describe('typesForCategory (#347)', () => {
  test('Quality offers the full workout-type set', () => {
    expect(typesForCategory('Quality')).toContain('Hills')
    expect(typesForCategory('Quality')).toContain('Progression')
    expect(typesForCategory('Quality').length).toBeGreaterThan(1)
  })

  test('Easy and Long are single-type (auto-selected, no picker)', () => {
    expect(typesForCategory('Easy')).toEqual(['Easy'])
    expect(typesForCategory('Long')).toEqual(['Long'])
  })

  test('Progression is a Quality type, not a Long one', () => {
    expect(typesForCategory('Quality')).toContain('Progression')
    expect(typesForCategory('Long')).not.toContain('Progression')
  })

  test('an unknown or empty category yields no types', () => {
    expect(typesForCategory('')).toEqual([])
    expect(typesForCategory('Food')).toEqual([])
  })
})

describe('findCollidingFamily (#354)', () => {
  const families = [
    { familyId: 1, name: 'Yasso 800s' },
    { familyId: 2, name: 'Fort Greene Hills' },
    { familyId: 3, name: 'McCarren Easy Loop' },
  ]

  test('returns the family when the name matches exactly', () => {
    expect(findCollidingFamily(families, 'Yasso 800s')).toEqual({ familyId: 1, name: 'Yasso 800s' })
  })

  test('matches case-insensitively', () => {
    expect(findCollidingFamily(families, 'yasso 800s')).toEqual({ familyId: 1, name: 'Yasso 800s' })
    expect(findCollidingFamily(families, 'FORT GREENE HILLS')).toEqual({ familyId: 2, name: 'Fort Greene Hills' })
  })

  test('ignores leading/trailing whitespace on the input', () => {
    expect(findCollidingFamily(families, '  Yasso 800s  ')).toEqual({ familyId: 1, name: 'Yasso 800s' })
  })

  test("matches a family owned by any run (shared catalog) — e.g. another run's Easy workout", () => {
    expect(findCollidingFamily(families, 'mccarren easy loop')).toEqual({ familyId: 3, name: 'McCarren Easy Loop' })
  })

  test('returns null for a unique name', () => {
    expect(findCollidingFamily(families, 'Prospect Park Tempo')).toBeNull()
  })

  test('returns null for an empty or whitespace-only name', () => {
    expect(findCollidingFamily(families, '')).toBeNull()
    expect(findCollidingFamily(families, '   ')).toBeNull()
  })

  test('returns null against an empty catalog', () => {
    expect(findCollidingFamily([], 'Anything')).toBeNull()
  })
})

// Guards the helper that already backs the create/review chip toggles, colocated
// here so lib/workoutForm has direct unit coverage.
describe('toggleItem', () => {
  test('adds an item that is absent and removes one that is present', () => {
    expect(toggleItem(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleItem(['a', 'b'], 'a')).toEqual(['b'])
  })
})
