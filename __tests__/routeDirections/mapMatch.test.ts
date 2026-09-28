import { describe, it, expect, vi } from 'vitest'
import { chunkPoints, stitchStreets, mapMatch } from '@/lib/routeDirections/mapMatch'
import type { LatLng } from '@/lib/routeDirections/types'

describe('chunkPoints', () => {
  it('splits >100-point traces into <=size chunks with overlap and no gaps', () => {
    const pts: LatLng[] = Array.from({ length: 243 }, (_, i) => [40 + i / 1e4, -73])
    const chunks = chunkPoints(pts, 95, 1)
    expect(chunks.length).toBe(3)
    expect(Math.max(...chunks.map(c => c.length))).toBeLessThanOrEqual(95)
    // overlap: last point of chunk N equals first point of chunk N+1
    expect(chunks[0][chunks[0].length - 1]).toEqual(chunks[1][0])
    expect(chunks.every(c => c.length >= 2)).toBe(true)
  })
})

describe('stitchStreets', () => {
  it('drops empties and collapses consecutive duplicates, preserving revisits', () => {
    const raw = ['', 'North 12th Street', '', 'Kent Avenue', 'Kent Avenue', 'Flushing Avenue', '', 'Kent Avenue']
    expect(stitchStreets(raw)).toEqual(['North 12th Street', 'Kent Avenue', 'Flushing Avenue', 'Kent Avenue'])
  })
})

describe('mapMatch', () => {
  it('chunks, calls Mapbox per chunk, and returns stitched street names', async () => {
    const pts: LatLng[] = Array.from({ length: 96 }, (_, i) => [40 + i / 1e4, -73])
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: 'Ok', matchings: [{ legs: [{ steps: [{ name: 'Kent Avenue' }, { name: '' }, { name: 'Flushing Avenue' }] }] }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: 'Ok', matchings: [{ legs: [{ steps: [] }] }] }),
      }) as unknown as typeof fetch
    const streets = await mapMatch(pts, 'pk.test', fetchImpl)
    expect(fetchImpl).toHaveBeenCalledTimes(2) // 96 pts, size 95, overlap 1 -> 2 chunks
    const url = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toContain('/matching/v5/mapbox/walking/')
    expect(url).toContain('access_token=pk.test')
    expect(streets).toEqual(['Kent Avenue', 'Flushing Avenue'])
  })

  it('skips a chunk that returns a non-Ok match without throwing', async () => {
    const pts: LatLng[] = Array.from({ length: 10 }, (_, i) => [40 + i / 1e4, -73])
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ code: 'NoMatch' }) }) as unknown as typeof fetch
    await expect(mapMatch(pts, 'pk.test', fetchImpl)).resolves.toEqual([])
  })
})
