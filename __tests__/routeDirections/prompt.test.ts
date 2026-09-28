import { describe, it, expect } from 'vitest'
import { buildDirectionsPrompt } from '@/lib/routeDirections/prompt'
import type { DirectionsInput } from '@/lib/routeDirections/types'

const input: DirectionsInput = {
  routeName: 'DOVES Carousel',
  distanceMiles: 8.56,
  streets: ['North 12th Street', 'Kent Avenue', 'Flushing Avenue', 'Plymouth Street'],
  shape: { returnsToStart: true, startToEndMeters: 20 },
  landmarks: [
    { name: 'McCarren Park', anchor: 'start', distanceMeters: 30 },
    { name: 'Jane\'s Carousel', anchor: 'turnaround', distanceMeters: 26 },
  ],
}

describe('buildDirectionsPrompt', () => {
  it('includes the streets, landmarks, and shape', () => {
    const p = buildDirectionsPrompt(input)
    expect(p).toContain('Kent Avenue')
    expect(p).toContain('McCarren Park')
    expect(p).toContain('turnaround')
    expect(p).toContain('DOVES Carousel')
  })
  it('instructs the model not to invent street or landmark names', () => {
    const p = buildDirectionsPrompt(input).toLowerCase()
    expect(p).toMatch(/only.*(streets|landmarks|names).*(provided|listed|given)|do not (invent|make up|add)/)
  })
})
