import { describe, test, expect } from 'vitest'
import { passesRatingThreshold } from '../lib/rating'
import type { VoteData } from '../lib/votes'

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
