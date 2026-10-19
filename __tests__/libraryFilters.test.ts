import { describe, test, expect } from 'vitest'
import {
  EMPTY_FILTERS,
  activeFilterCount,
  activeFilterSummary,
  matchesQuery,
  applyLibraryFilters,
  withCategory,
  withScope,
  type LibraryFilters,
} from '../lib/libraryFilters'
import type { WorkoutVariantRow } from '../lib/data'
import type { VoteData } from '../lib/votes'
import { workoutVoteId } from '../lib/votes'

function makeVariant(
  o: Pick<WorkoutVariantRow, 'id' | 'familyId' | 'name' | 'category' | 'type'> &
    Partial<Pick<WorkoutVariantRow, 'label' | 'reason' | 'raceTypes'>>,
): WorkoutVariantRow {
  return {
    label: null, sortOrder: 1, reason: '', rawInput: '', distTime: '', energySystem: '',
    hrZone: '', rpe: '', coachingNotes: null, mapLink: null, distanceMiles: null,
    elevationGainFeet: null, geometry: null, mapImageUrl: null, routeNarrative: null,
    author: null, raceTypes: [], trainingPhases: [], hasTurnaround: false, turnaround: '',
    flagged: false, flagNote: '', runGroupId: null, lastRan: null, ...o,
  }
}

const hills = makeVariant({ id: 1, familyId: 10, name: 'Fort Greene Hills', category: 'Quality', type: 'Hills', raceTypes: ['5K'] })
const ladder = makeVariant({ id: 2, familyId: 20, name: 'Track Ladder', category: 'Quality', type: 'Ladder' })
const easy = makeVariant({ id: 3, familyId: 30, name: 'McCarren Easy Loop', category: 'Easy', type: 'Easy' })
const all = [hills, ladder, easy]

describe('activeFilterCount / activeFilterSummary', () => {
  test('empty filters → 0 and an empty summary', () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0)
    expect(activeFilterSummary(EMPTY_FILTERS)).toBe('')
  })

  test('counts and summarizes each active facet in order', () => {
    const f: LibraryFilters = { category: 'Quality', type: 'Hills', race: '5K', rating: 'good', showAllRuns: true }
    expect(activeFilterCount(f)).toBe(5)
    expect(activeFilterSummary(f)).toBe('Quality · Hills · 5K · 😃 & up · All runs')
  })

  test('"any" rating and "Your run" scope are not counted', () => {
    const f: LibraryFilters = { ...EMPTY_FILTERS, category: 'Easy' }
    expect(activeFilterCount(f)).toBe(1)
    expect(activeFilterSummary(f)).toBe('Easy')
  })
})

describe('matchesQuery', () => {
  test('empty query matches everything', () => {
    expect(matchesQuery(hills, '')).toBe(true)
    expect(matchesQuery(hills, '   ')).toBe(true)
  })
  test('matches name, type, and race type case-insensitively', () => {
    expect(matchesQuery(hills, 'fort')).toBe(true)
    expect(matchesQuery(hills, 'hills')).toBe(true)
    expect(matchesQuery(hills, '5k')).toBe(true)
    expect(matchesQuery(hills, 'ladder')).toBe(false)
  })
  test('matches the label and reason fields case-insensitively', () => {
    const v = makeVariant({ id: 9, familyId: 90, name: 'Hill Repeats', category: 'Quality', type: 'Hills', label: 'Short', reason: 'VO2 max builder' })
    expect(matchesQuery(v, 'short')).toBe(true)    // label
    expect(matchesQuery(v, 'vo2 max')).toBe(true)  // reason
    expect(matchesQuery(v, 'tempo')).toBe(false)
  })
})

describe('applyLibraryFilters', () => {
  const noVotes: Record<string, VoteData | null> = {}
  test('category + type + race AND together', () => {
    const f: LibraryFilters = { ...EMPTY_FILTERS, category: 'Quality' }
    expect(applyLibraryFilters(all, f, '', noVotes).map(w => w.id)).toEqual([1, 2])
    expect(applyLibraryFilters(all, { ...f, type: 'Hills' }, '', noVotes).map(w => w.id)).toEqual([1])
    expect(applyLibraryFilters(all, { ...f, race: '5K' }, '', noVotes).map(w => w.id)).toEqual([1])
  })
  test('query ANDs with the facets', () => {
    expect(applyLibraryFilters(all, EMPTY_FILTERS, 'mccarren', noVotes).map(w => w.id)).toEqual([3])
  })
  test('rating threshold ANDs: a zero-vote row fails any non-"any" threshold', () => {
    const votes = { [workoutVoteId(hills.name, '')]: { avg: 5, count: 4 } as VoteData }
    const f: LibraryFilters = { ...EMPTY_FILTERS, rating: 'good' }
    expect(applyLibraryFilters(all, f, '', votes).map(w => w.id)).toEqual([1]) // only the rated row survives
  })
})

describe('reset rules (withCategory / withScope)', () => {
  test('changing category clears the type filter', () => {
    const f: LibraryFilters = { ...EMPTY_FILTERS, category: 'Quality', type: 'Hills' }
    expect(withCategory(f, 'Easy')).toEqual({ ...EMPTY_FILTERS, category: 'Easy' })
  })
  test('toggling scope clears category and type but keeps race/rating', () => {
    const f: LibraryFilters = { category: 'Quality', type: 'Hills', race: '5K', rating: 'good', showAllRuns: false }
    expect(withScope(f, true)).toEqual({ category: null, type: null, race: '5K', rating: 'good', showAllRuns: true })
  })
})
