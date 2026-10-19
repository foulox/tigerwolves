import { describe, test, expect } from 'vitest'
import { rankByRating, ratingScore, meanOfRatedAverages, RATING_SORT_M } from '../lib/rating'
import type { VoteData } from '../lib/votes'
import { workoutVoteId } from '../lib/votes'

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
    // A realistic population keeps C (mean of rated avgs) near the true baseline
    // (~3), which is where the Bayesian shrinkage actually demotes a lone 5-star
    // below a well-voted 4-star. A 2-item fixture where both rate high pushes C to
    // 4.5 — a degenerate case where no m can demote the 5-star (the prior sits
    // between the two averages). See #241 plan Review Focus.
    const rows = [
      row(1, 'OneVoteLove'),
      row(2, 'ManyVotesGood'),
      row(3, 'Mid'),
      row(4, 'Meh'),
      row(5, 'Bad'),
    ]
    const vd = {
      [key('OneVoteLove')]: { avg: 5, count: 1 },
      [key('ManyVotesGood')]: { avg: 4, count: 20 },
      [key('Mid')]: { avg: 3, count: 15 },
      [key('Meh')]: { avg: 3, count: 12 },
      [key('Bad')]: { avg: 2, count: 18 },
    }
    const out = rankByRating(rows, vd).map(r => r.id)
    // C = (5+4+3+3+2)/5 = 3.4; ManyVotesGood scores 3.88, OneVoteLove 3.667.
    expect(out.indexOf(2)).toBeLessThan(out.indexOf(1)) // well-voted 😃 outranks 1-vote 🥳
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
    expect(ratingScore(null, meanOfRatedAverages({}))).toBe(0)
  })

  test('ratingScore matches the formula for a rated row', () => {
    // v=20, R=4, C=3, m=5 -> (20/25)*4 + (5/25)*3 = 3.2 + 0.6 = 3.8
    expect(ratingScore({ avg: 4, count: 20 }, 3)).toBeCloseTo(3.8, 5)
  })
})

