import { describe, it, expect, vi } from 'vitest'
import { anchorPoints, rankCandidates, landmarks } from '@/lib/routeDirections/landmarks'
import type { LatLng } from '@/lib/routeDirections/types'

describe('anchorPoints', () => {
  it('returns first, last, and the farthest-from-start point', () => {
    const pts: LatLng[] = [[40.7208, -73.9510], [40.7040, -73.9920], [40.7261, -73.9522]]
    const a = anchorPoints(pts)
    expect(a.start).toEqual([40.7208, -73.9510])
    expect(a.end).toEqual([40.7261, -73.9522])
    expect(a.turnaround).toEqual([40.7040, -73.9920]) // farthest from start
  })
})

describe('rankCandidates', () => {
  it('dedupes by name, sorts by distance, caps, and tags the anchor', () => {
    const feats = [
      { properties: { name: 'Tom Stofka Garden', tilequery: { distance: 45 } } },
      { properties: { name: 'McCarren Park', tilequery: { distance: 30 } } },
      { properties: { name: 'McCarren Park', tilequery: { distance: 90 } } },
      { properties: { tilequery: { distance: 5 } } }, // unnamed -> dropped
    ]
    const ranked = rankCandidates(feats, 'start')
    expect(ranked.map(r => r.name)).toEqual(['McCarren Park', 'Tom Stofka Garden'])
    expect(ranked[0]).toEqual({ name: 'McCarren Park', anchor: 'start', distanceMeters: 30 })
  })
})

describe('landmarks', () => {
  it('queries each anchor and returns tagged candidates', async () => {
    const pts: LatLng[] = [[40.7208, -73.9510], [40.7040, -73.9920], [40.7261, -73.9522]]
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [{ properties: { name: "Jane's Carousel", tilequery: { distance: 26 } } }] }),
    }) as unknown as typeof fetch
    const out = await landmarks(pts, 'pk.test', fetchImpl)
    expect(fetchImpl).toHaveBeenCalledTimes(3) // start, turnaround, end
    const url = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toContain('/v4/mapbox.mapbox-streets-v8/tilequery/')
    expect(out.some(c => c.name === "Jane's Carousel")).toBe(true)
    expect(new Set(out.map(c => c.anchor))).toEqual(new Set(['start', 'turnaround', 'end']))
  })
})
