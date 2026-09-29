import { describe, it, expect } from 'vitest'
import { metersBetween } from '@/lib/routeDirections/geo'
import { analyzeShape } from '@/lib/routeDirections/shape'
import type { LatLng } from '@/lib/routeDirections/types'

describe('metersBetween', () => {
  it('is ~0 for identical points', () => {
    expect(metersBetween([40.72, -73.95], [40.72, -73.95])).toBeCloseTo(0, 1)
  })
  it('measures a short city hop within ~10% of a known distance', () => {
    // ~157m north
    const d = metersBetween([40.7200, -73.9500], [40.7214, -73.9500])
    expect(d).toBeGreaterThan(140)
    expect(d).toBeLessThan(175)
  })
})

describe('analyzeShape', () => {
  it('flags a loop/out-and-back that ends near its start', () => {
    const pts: LatLng[] = [[40.7200, -73.9500], [40.7300, -73.9600], [40.7201, -73.9501]]
    const s = analyzeShape(pts)
    expect(s.returnsToStart).toBe(true)
    expect(s.startToEndMeters).toBeLessThan(200)
  })
  it('flags a point-to-point that ends far from its start', () => {
    const pts: LatLng[] = [[40.7208, -73.9510], [40.7100, -73.9700], [40.7040, -73.9920]]
    const s = analyzeShape(pts)
    expect(s.returnsToStart).toBe(false)
    expect(s.startToEndMeters).toBeGreaterThan(200)
  })
})
