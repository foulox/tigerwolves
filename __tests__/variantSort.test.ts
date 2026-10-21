import { describe, test, expect } from 'vitest'
import { sortVariants, DEFAULT_DIR, sortCountLabel, directionApplies } from '../lib/variantSort'
import type { WorkoutVariantRow } from '../lib/data'
import type { VoteData } from '../lib/votes'
import { workoutVoteId } from '../lib/votes'

function v(o: Pick<WorkoutVariantRow, 'id' | 'name'> & Partial<Pick<WorkoutVariantRow, 'lastRan' | 'label'>>): WorkoutVariantRow {
  return {
    familyId: o.id, category: 'Quality', type: 'Hills', label: null, sortOrder: 1, reason: '',
    rawInput: '', distTime: '', energySystem: '', hrZone: '', rpe: '', coachingNotes: null,
    mapLink: null, distanceMiles: null, elevationGainFeet: null, geometry: null, mapImageUrl: null,
    routeNarrative: null, author: null, raceTypes: [], trainingPhases: [], hasTurnaround: false,
    turnaround: '', flagged: false, flagNote: '', runGroupId: null, lastRan: null, ...o,
  }
}

const a = v({ id: 1, name: 'Alpha', lastRan: '2026-03-01' })
const b = v({ id: 2, name: 'Bravo', lastRan: '2026-01-01' })
const never = v({ id: 3, name: 'Charlie', lastRan: null })
const rows = [a, b, never]
const noVotes: Record<string, VoteData | null> = {}

describe('sortVariants — recent excludes never-ran (the #536 bug fix)', () => {
  test('ascending (oldest first) drops the never-ran row entirely', () => {
    const out = sortVariants(rows, 'recent', 'asc', noVotes)
    expect(out.map(r => r.id)).toEqual([2, 1]) // Bravo (older) then Alpha; Charlie excluded
  })
  test('descending (most recent first) still excludes never-ran', () => {
    expect(sortVariants(rows, 'recent', 'desc', noVotes).map(r => r.id)).toEqual([1, 2])
  })
})

describe('sortVariants — A–Z includes everything', () => {
  test('ascending is by name, never-ran included', () => {
    expect(sortVariants(rows, 'az', 'asc', noVotes).map(r => r.name)).toEqual(['Alpha', 'Bravo', 'Charlie'])
  })
  test('descending reverses', () => {
    expect(sortVariants(rows, 'az', 'desc', noVotes).map(r => r.name)).toEqual(['Charlie', 'Bravo', 'Alpha'])
  })
})

describe('sortVariants — rating uses the weighted rank', () => {
  test('a well-voted moderate beats a one-vote high; direction flips the order', () => {
    // Confidence weighting (lib/rating, m=5): a lone 5.0 vote is shrunk toward the
    // prior, so Alpha's 4.5-with-30-votes outranks Bravo's 5.0-with-1-vote. Charlie
    // (lower avg, mid count) anchors the prior low enough for the flip to be real —
    // a 2-variant fixture can't show it, since Bravo's own high avg drags the prior up.
    const votes = {
      [workoutVoteId('Alpha', '')]: { avg: 4.5, count: 30 } as VoteData,
      [workoutVoteId('Bravo', '')]: { avg: 5.0, count: 1 } as VoteData,
      [workoutVoteId('Charlie', '')]: { avg: 3.0, count: 10 } as VoteData,
    }
    const desc = sortVariants([a, b, never], 'rating', 'desc', votes).map(r => r.id)
    expect(desc).toEqual([1, 2, 3]) // Alpha (confidence-weighted) leads the 1-vote 5.0; Charlie last
    const asc = sortVariants([a, b, never], 'rating', 'asc', votes).map(r => r.id)
    expect(asc).toEqual([...desc].reverse())
  })
})

describe('sortVariants — distance (nulls trail, never coerced to 0)', () => {
  const short = v({ id: 10, name: 'Short', lastRan: '2026-01-01' }); short.distanceMiles = 2.0
  const mid = v({ id: 11, name: 'Mid', lastRan: '2026-01-01' }); mid.distanceMiles = 5.0
  const long = v({ id: 12, name: 'Long', lastRan: '2026-01-01' }); long.distanceMiles = 9.0
  const unknown = v({ id: 13, name: 'Unknown', lastRan: '2026-01-01' }); unknown.distanceMiles = null
  const rows = [long, unknown, short, mid]
  const noVotes = {}

  test('ascending = shortest first, null distance trails', () => {
    expect(sortVariants(rows, 'distance', 'asc', noVotes).map(r => r.id)).toEqual([10, 11, 12, 13])
  })
  test('descending = longest first, null distance still trails', () => {
    expect(sortVariants(rows, 'distance', 'desc', noVotes).map(r => r.id)).toEqual([12, 11, 10, 13])
  })
})

describe('defaults + labels', () => {
  test('default directions', () => {
    expect(DEFAULT_DIR).toEqual({ recent: 'asc', rating: 'desc', az: 'asc', distance: 'asc' })
  })
  test('count-line labels name the dimension + direction', () => {
    expect(sortCountLabel('recent', 'asc')).toBe('Last ran, oldest first')
    expect(sortCountLabel('recent', 'desc')).toBe('Last ran, most recent first')
    expect(sortCountLabel('rating', 'desc')).toBe('Rating')
    expect(sortCountLabel('az', 'asc')).toBe('A–Z')
    expect(sortCountLabel('az', 'desc')).toBe('Z–A')
    expect(sortCountLabel('distance', 'asc')).toBe('Distance, shortest first')
    expect(sortCountLabel('distance', 'desc')).toBe('Distance, longest first')
  })
  test('direction applies to all but Rating', () => {
    expect(directionApplies('recent')).toBe(true)
    expect(directionApplies('az')).toBe(true)
    expect(directionApplies('distance')).toBe(true)
    expect(directionApplies('rating')).toBe(false)
  })
})
