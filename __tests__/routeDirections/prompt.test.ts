import { describe, it, expect } from 'vitest'
import { buildDirectionsPrompt } from '@/lib/routeDirections/prompt'
import type { DirectionsInput } from '@/lib/routeDirections/types'

const base: DirectionsInput = {
  routeName: 'K Bridge', distanceMiles: 3.7, shape: { returnsToStart: true, startToEndMeters: 10 },
  legs: [
    { street: 'Driggs Avenue', miles: 0.5, turn: 'none', feature: 'street' },
    { street: 'Kosciuszko Bridge', miles: 0.85, turn: 'right', feature: 'bridge' },
  ],
  landmarks: [{ name: 'Uro Cafe', anchor: 'start', distanceMeters: 20 }],
}

it('lists legs with turn + distance and states the phrasing rules', () => {
  const p = buildDirectionsPrompt(base)
  expect(p).toContain('Driggs Avenue')
  expect(p).toContain('0.5')
  expect(p).toMatch(/bridge/i)
  expect(p).toMatch(/never.*(invent|fabricate)/i)
  expect(p).toMatch(/turn around|turnaround/i)
})
