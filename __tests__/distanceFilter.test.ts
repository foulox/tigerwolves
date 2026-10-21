import { describe, test, expect } from 'vitest'
import { distanceBounds, applyDistanceRange, distanceRangeSummary } from '../lib/distanceFilter'

const rows = [
  { id: 1, distanceMiles: 2.0 }, { id: 2, distanceMiles: 3.8 },
  { id: 3, distanceMiles: 9.1 }, { id: 4, distanceMiles: null },
]

describe('distanceBounds', () => {
  test('span of present distances, rounded out to 0.1', () => {
    expect(distanceBounds(rows)).toEqual({ min: 2.0, max: 9.1 })
  })
  test('null when no row has a distance', () => {
    expect(distanceBounds([{ distanceMiles: null }])).toBeNull()
  })
  test('single distance yields a valid (min===max) span', () => {
    expect(distanceBounds([{ distanceMiles: 4.0 }])).toEqual({ min: 4.0, max: 4.0 })
  })
})

describe('applyDistanceRange', () => {
  test('inactive (null) keeps everything, including null-distance rows', () => {
    expect(applyDistanceRange(rows, null).map(r => r.id)).toEqual([1, 2, 3, 4])
  })
  test('active range keeps only in-range distances; null-distance drops', () => {
    expect(applyDistanceRange(rows, { min: 3, max: 6 }).map(r => r.id)).toEqual([2])
  })
})

describe('distanceRangeSummary', () => {
  test('formats an active range; empty when inactive', () => {
    expect(distanceRangeSummary({ min: 3, max: 6 })).toBe('3.0–6.0 mi')
    expect(distanceRangeSummary(null)).toBe('')
  })
})
