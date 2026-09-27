import { describe, test, expect } from 'vitest'
import { passesRatingThreshold, rankByRating, ratingScore, meanOfRatedAverages, RATING_SORT_M } from '../lib/rating'
import type { VoteData } from '../lib/votes'
import { workoutVoteId } from '../lib/votes'

const v = (avg: number, count: number): VoteData => ({ avg, count })

describe('passesRatingThreshold', () => {
  test('"any" passes everything, including null and zero-vote rows', () => {
    expect(passesRatingThreshold(v(4, 10), 'any')).toBe(true)
    expect(passesRatingThreshold(null, 'any')).toBe(true)
    expect(passesRatingThreshold(undefined, 'any')).toBe(true)
    expect(passesRatingThreshold(v(0, 0), 'any')).toBe(true)
  })

  test('null / undefined / zero-vote rows fail any non-"any" threshold', () => {
    for (const t of ['ok', 'good', 'love'] as const) {
      expect(passesRatingThreshold(null, t)).toBe(false)
      expect(passesRatingThreshold(undefined, t)).toBe(false)
      expect(passesRatingThreshold(v(5, 0), t)).toBe(false) // avg looks high but no votes
    }
  })

  test('"ok" is avg >= 3', () => {
    expect(passesRatingThreshold(v(3, 2), 'ok')).toBe(true)
    expect(passesRatingThreshold(v(2, 2), 'ok')).toBe(false)
  })

  test('"good" is avg >= 4', () => {
    expect(passesRatingThreshold(v(4, 2), 'good')).toBe(true)
    expect(passesRatingThreshold(v(3, 2), 'good')).toBe(false)
  })

  test('"love" is avg >= 5', () => {
    expect(passesRatingThreshold(v(5, 2), 'love')).toBe(true)
    expect(passesRatingThreshold(v(4, 2), 'love')).toBe(false)
  })
})

type Row = { id: number; name: string; label: string | null }
const row = (id: number, name: string): Row => ({ id, name, label: null })
const key = (name: string) => workoutVoteId(name, '')

describe('meanOfRatedAverages', () => {
  test('averages only entries with votes; ignores null and zero-vote', () => {
    const vd = {
      [key('A')]: { avg: 4, count: 10 },
      [key('B')]: { avg: 2, count: 4 },
      [key('C')]: null,
      [key('D')]: { avg: 5, count: 0 },
    }
    expect(meanOfRatedAverages(vd)).toBe(3) // (4 + 2) / 2
  })

  test('empty voteData yields C = 0', () => {
    expect(meanOfRatedAverages({})).toBe(0)
  })
})

describe('rankByRating', () => {
  test('m is 5', () => {
    expect(RATING_SORT_M).toBe(5)
  })

  test('few votes cannot beat many (1-vote 🥳 ranks below well-voted 😃)', () => {
    const rows = [row(1, 'OneVoteLove'), row(2, 'ManyVotesGood')]
    const vd = {
      [key('OneVoteLove')]: { avg: 5, count: 1 },
      [key('ManyVotesGood')]: { avg: 4, count: 20 },
    }
    const out = rankByRating(rows, vd)
    expect(out.map(r => r.id)).toEqual([2, 1]) // ManyVotesGood first
  })

  test('C correctness: an unrated row parks at the prior C, between above- and below-average rated rows', () => {
    // C = mean of rated avgs = (5 + 1) / 2 = 3
    const rows = [row(1, 'High'), row(2, 'Unrated'), row(3, 'Low')]
    const vd = {
      [key('High')]: { avg: 5, count: 30 },
      [key('Low')]: { avg: 1, count: 30 },
      // Unrated: absent from voteData
    }
    const out = rankByRating(rows, vd)
    expect(out.map(r => r.id)).toEqual([1, 2, 3]) // High, Unrated (=C), Low
  })

  test('single rated variant sorts without error', () => {
    const rows = [row(1, 'Only')]
    const vd = { [key('Only')]: { avg: 4, count: 3 } }
    expect(rankByRating(rows, vd).map(r => r.id)).toEqual([1])
  })

  test('empty voteData is a stable no-op (no NaN), input order preserved', () => {
    const rows = [row(3, 'C'), row(1, 'A'), row(2, 'B')]
    const out = rankByRating(rows, {})
    expect(out.map(r => r.id)).toEqual([3, 1, 2])
    for (const r of rows) expect(ratingScore(null, meanOfRatedAverages({}))).toBe(0)
  })

  test('ratingScore matches the formula for a rated row', () => {
    // v=20, R=4, C=3, m=5 -> (20/25)*4 + (5/25)*3 = 3.2 + 0.6 = 3.8
    expect(ratingScore({ avg: 4, count: 20 }, 3)).toBeCloseTo(3.8, 5)
  })
})
