import { describe, it, expect, vi } from 'vitest'
import { generateNarrative } from '@/lib/routeDirections'
import type { LatLng } from '@/lib/routeDirections/types'

const trace: LatLng[] = [[40.72, -73.95], [40.70, -73.99], [40.72, -73.95]]

it('returns null when there is no trace', async () => {
  const out = await generateNarrative({ url: 'https://x' }, { fetchFullTrace: async () => [] })
  expect(out).toBeNull()
})

it('returns null when no streets match', async () => {
  const out = await generateNarrative({ url: 'https://x' }, {
    fetchFullTrace: async () => trace, mapMatch: async () => [], landmarks: async () => [], composeNarrative: async () => 'x',
  })
  expect(out).toBeNull()
})

it('composes a narrative from streets + landmarks', async () => {
  const compose = vi.fn().mockResolvedValue('Out of McCarren down Kent...')
  const out = await generateNarrative({ url: 'https://x', routeName: 'DOVES', distanceMiles: 8.5 }, {
    fetchFullTrace: async () => trace,
    mapMatch: async () => ['Kent Avenue', 'Flushing Avenue'],
    landmarks: async () => [{ name: 'McCarren Park', anchor: 'start', distanceMeters: 30 }],
    composeNarrative: compose,
  })
  expect(out).toBe('Out of McCarren down Kent...')
  expect(compose.mock.calls[0][0].streets).toEqual(['Kent Avenue', 'Flushing Avenue'])
  expect(compose.mock.calls[0][0].shape.returnsToStart).toBe(true)
})
