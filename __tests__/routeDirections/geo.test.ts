import { describe, it, expect } from 'vitest'
import { bearing, classifyTurn } from '@/lib/routeDirections/geo'

describe('bearing', () => {
  it('is ~0 heading due north and ~90 due east', () => {
    expect(bearing([0, 0], [1, 0])).toBeCloseTo(0, 0)
    expect(bearing([0, 0], [0, 1])).toBeCloseTo(90, 0)
  })
})

describe('classifyTurn', () => {
  const straight = { incoming: [[0, 0], [0, 1]] as [number,number][], outgoing: [[0, 1], [0, 2]] as [number,number][] }
  it('returns none when the heading barely changes', () => {
    expect(classifyTurn(straight.incoming, straight.outgoing)).toBe('none')
  })
  it('returns right for a ~90° clockwise change', () => {
    // heading east then turning to head south
    expect(classifyTurn([[0, 0], [0, 1]], [[0, 1], [-1, 1]])).toBe('right')
  })
  it('returns left for a ~90° counter-clockwise change', () => {
    expect(classifyTurn([[0, 0], [0, 1]], [[0, 1], [1, 1]])).toBe('left')
  })
  it('returns turnaround for a ~180° reversal', () => {
    expect(classifyTurn([[0, 0], [0, 1]], [[0, 1], [0, 0]])).toBe('turnaround')
  })
  it('returns none when either side has fewer than 2 points', () => {
    expect(classifyTurn([[0, 0]], [[0, 1], [0, 2]])).toBe('none')
  })
})
