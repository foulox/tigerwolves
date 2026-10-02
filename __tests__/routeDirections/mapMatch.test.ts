import { describe, it, expect } from 'vitest'
import { mapMatch } from '@/lib/routeDirections/mapMatch'
import type { LatLng } from '@/lib/routeDirections/types'

const fakeMapbox = (steps: { name: string; distance: number; coords: [number, number][] }[]) =>
  (async () => ({
    ok: true,
    json: async () => ({ code: 'Ok', matchings: [{ legs: [{ steps: steps.map(s => ({ name: s.name, distance: s.distance, geometry: { coordinates: s.coords } })) }] }] }),
  })) as unknown as typeof fetch

it('returns structured steps with name, meters and [lat,lng] coords', async () => {
  const pts: LatLng[] = [[40, -73], [40.01, -73]]
  const out = await mapMatch(pts, 'tok', fakeMapbox([
    { name: 'Driggs Avenue', distance: 100, coords: [[-73, 40], [-73, 40.01]] },
  ]))
  expect(out).toEqual([{ name: 'Driggs Avenue', meters: 100, coords: [[40, -73], [40.01, -73]] }])
})

it('returns [] when the token is missing', async () => {
  expect(await mapMatch([[40, -73], [40.01, -73]], '')).toEqual([])
})
