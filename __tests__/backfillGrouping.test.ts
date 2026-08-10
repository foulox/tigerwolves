import { describe, it, expect } from 'vitest'
import { groupWorkoutsIntoFamilies as group } from '@/lib/backfillGrouping'
import type { Workout } from '@/lib/data'

function workout(overrides: Partial<Omit<Workout, 'lastRan'>> & Pick<Omit<Workout, 'lastRan'>, 'name'>): Workout {
  return {
    sport: 'Run',
    category: 'Quality',
    type: 'Straight Tempo',
    reason: 'Builds tempo endurance',
    instructions: '20min @ tempo effort.',
    distTime: '4 mi',
    lapStructure: '',
    energySystem: '',
    hrZone: '',
    rpe: '',
    lastRan: null,
    coachingNotes: null,
    mapLink: null,
    variation: '',
    progression: null,
    author: 'TigerWolves',
    raceTypes: [],
    trainingPhases: [],
    hasTurnaround: false,
    turnaroundDistance: '',
    flagged: false,
    flagNote: '',
    ...overrides,
  }
}

describe('groupWorkoutsIntoFamilies', () => {
  it('makes a standalone family for a workout with no variation', () => {
    const families = group([workout({ name: 'Prospect Park Tempo' })], 1)
    expect(families).toHaveLength(1)
    expect(families[0].legacyName).toBe('Prospect Park Tempo')
    expect(families[0].variants).toHaveLength(1)
    expect(families[0].variants[0].label).toBeNull()
    expect(families[0].warnings).toEqual([])
  })

  it('groups rows sharing a name into one family, ordered by progression', () => {
    const families = group([
      workout({ name: 'McCarren Loop Repeats', variation: 'Long loop, 4x1200m', progression: 2 }),
      workout({ name: 'McCarren Loop Repeats', variation: 'Short loop, 6x800m', progression: 1 }),
    ], 1)
    expect(families).toHaveLength(1)
    const [family] = families
    expect(family.variants.map(v => v.sortOrder)).toEqual([2, 1])
    expect(family.variants.map(v => v.label)).toEqual(['Long loop, 4x1200m', 'Short loop, 6x800m'])
  })

  it('carries has_turnaround straight from the legacy row, per-variant', () => {
    const families = group([
      workout({ name: 'Yasso 800s', hasTurnaround: true }),
    ], 1)
    expect(families[0].variants[0].hasTurnaround).toBe(true)
    expect(families[0].variants[0].turnaround).toBe('')
  })

  it('picks the lowest-progression row as the family representative', () => {
    const families = group([
      workout({ name: 'Fort Greene Hills', variation: 'Longer', progression: 2, reason: 'Second reason' }),
      workout({ name: 'Fort Greene Hills', variation: 'Shorter', progression: 1, reason: 'First reason' }),
    ], 1)
    expect(families[0].reason).toBe('First reason')
  })

  it('falls back to alphabetical-by-variation when no row has a progression', () => {
    const families = group([
      workout({ name: 'Track Ladder', variation: 'Z-variant', author: 'Second Author' }),
      workout({ name: 'Track Ladder', variation: 'A-variant', author: 'First Author' }),
    ], 1)
    expect(families[0].author).toBe('First Author')
  })

  it('warns when a family-level field disagrees across variants', () => {
    const families = group([
      workout({ name: 'Broken Tempo', variation: 'Shorter', progression: 1, type: 'Threshold' }),
      workout({ name: 'Broken Tempo', variation: 'Longer', progression: 2, type: 'Broken Tempo' }),
    ], 1)
    expect(families[0].warnings.some(w => w.includes('"type" differs'))).toBe(true)
  })

  it('warns when the representative category or type is not in the current form enums', () => {
    const families = group([
      workout({ name: 'Yasso 800s', category: 'Quality', type: 'Interval' }),
    ], 1)
    expect(families[0].warnings.some(w => w.includes('type "Interval" is not one of the current form types'))).toBe(true)
  })

  it('does not warn when category and type are already valid', () => {
    const families = group([
      workout({ name: 'Prospect Park Tempo', category: 'Quality', type: 'Straight Tempo' }),
    ], 1)
    expect(families[0].warnings).toEqual([])
  })

  it('defaults every family to the given run group id', () => {
    const families = group([
      workout({ name: 'Prospect Park Tempo' }),
      workout({ name: '10K Alternating Laps' }),
    ], 7)
    expect(families.every(f => f.runGroupId === 7)).toBe(true)
  })

  it('defaults to a global (no run group) family when the given id is null', () => {
    const families = group([workout({ name: 'Community Fun Run' })], null)
    expect(families[0].runGroupId).toBeNull()
  })

  it('assigns runGroupId per family, independently mutable by the caller', () => {
    const families = group([
      workout({ name: 'Prospect Park Tempo' }),
      workout({ name: '10K Alternating Laps' }),
    ], 1)
    families[1].runGroupId = null
    expect(families[0].runGroupId).toBe(1)
    expect(families[1].runGroupId).toBeNull()
  })
})
