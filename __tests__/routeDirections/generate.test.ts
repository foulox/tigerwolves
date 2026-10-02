import { describe, it, expect, vi } from 'vitest'
import { generateNarrative } from '@/lib/routeDirections'
import type { LatLng } from '@/lib/routeDirections/types'

const trace: LatLng[] = [[40.72, -73.95], [40.70, -73.99], [40.72, -73.95]]

it('returns null when there is no trace', async () => {
  const out = await generateNarrative({ url: 'https://x' }, { fetchFullTrace: async () => [] })
  expect(out).toBeNull()
})

it('returns null when no streets match and there are no landmarks', async () => {
  const out = await generateNarrative({ url: 'https://x' }, {
    fetchFullTrace: async () => trace, mapMatch: async () => [], landmarks: async () => [], composeNarrative: async () => 'x',
  })
  expect(out).toBeNull()
})

it('composes a narrative from legs + landmarks', async () => {
  const compose = vi.fn().mockResolvedValue('Out of McCarren down Kent...')
  const out = await generateNarrative({ url: 'https://x', routeName: 'DOVES', distanceMiles: 8.5 }, {
    fetchFullTrace: async () => trace,
    mapMatch: async () => [
      { name: 'Kent Avenue', meters: 1200, coords: [[40.72, -73.95], [40.71, -73.97]] },
      { name: 'Flushing Avenue', meters: 900, coords: [[40.71, -73.97], [40.70, -73.99]] },
    ],
    landmarks: async () => [{ name: 'McCarren Park', anchor: 'start', distanceMeters: 30 }],
    composeNarrative: compose,
  })
  expect(out).toBe('Out of McCarren down Kent...')
  expect(compose.mock.calls[0][0].legs).toHaveLength(2)
  expect(compose.mock.calls[0][0].legs[0].street).toBe('Kent Avenue')
  expect(compose.mock.calls[0][0].shape.returnsToStart).toBe(true)
})

it('returns null when the trace will not map-match and there are no landmarks', async () => {
  const n = await generateNarrative({ url: 'x', routeName: 'R', distanceMiles: 3 }, {
    fetchFullTrace: async () => [[0, 0], [0, 1]],
    mapMatch: async () => [],
    landmarks: async () => [],
    composeNarrative: async () => 'should not be called',
  })
  expect(n).toBeNull()
})
