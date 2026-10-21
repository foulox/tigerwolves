import { describe, test, expect } from 'vitest'
import { distanceBounds, applyDistanceRange, distanceRangeSummary, activeRange } from '../lib/distanceFilter'

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

describe('activeRange', () => {
  const bounds = { min: 3.0, max: 10.0 }

  test('a range fully within bounds is returned unchanged', () => {
    expect(activeRange({ min: 4.0, max: 8.0 }, bounds)).toEqual({ min: 4.0, max: 8.0 })
  })
  test('a range that exactly matches bounds is returned unchanged', () => {
    expect(activeRange({ min: 3.0, max: 10.0 }, bounds)).toEqual({ min: 3.0, max: 10.0 })
  })
  test('a range whose min is below bounds returns null (stale)', () => {
    expect(activeRange({ min: 1.0, max: 8.0 }, bounds)).toBeNull()
  })
  test('a range whose max is above bounds returns null (stale)', () => {
    expect(activeRange({ min: 4.0, max: 14.0 }, bounds)).toBeNull()
  })
  test('a range entirely outside bounds returns null', () => {
    expect(activeRange({ min: 0.5, max: 2.0 }, bounds)).toBeNull()
  })
  test('null range returns null', () => {
    expect(activeRange(null, bounds)).toBeNull()
  })
  test('null bounds returns null', () => {
    expect(activeRange({ min: 4.0, max: 8.0 }, null)).toBeNull()
  })
})
