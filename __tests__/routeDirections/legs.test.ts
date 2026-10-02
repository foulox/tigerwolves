import { describe, it, expect } from 'vitest'
import { buildLegs } from '@/lib/routeDirections/legs'
import type { MatchedStep } from '@/lib/routeDirections/types'

const M = 1609.344
const step = (name: string, miles: number, coords: [number, number][]): MatchedStep => ({ name, meters: miles * M, coords })

it('merges consecutive same-street steps and sums distance', () => {
  const legs = buildLegs([step('Driggs Avenue', 0.3, [[0, 0], [0, 1]]), step('Driggs Avenue', 0.3, [[0, 1], [0, 2]])])
  expect(legs).toHaveLength(1)
  expect(legs[0].street).toBe('Driggs Avenue')
  expect(legs[0].miles).toBeCloseTo(0.6, 2)
})

it('drops unnamed and sub-threshold legs', () => {
  const legs = buildLegs([step('', 0.5, [[0, 0], [0, 1]]), step('Meeker Avenue', 0.02, [[0, 1], [0, 1.01]])])
  expect(legs).toHaveLength(0)
})

it('computes the turn INTO each kept leg from geometry', () => {
  // head east on A, then turn to head south on B
  const legs = buildLegs([step('A St', 0.3, [[0, 0], [0, 1]]), step('B St', 0.3, [[0, 1], [-1, 1]])])
  expect(legs.map(l => l.turn)).toEqual(['none', 'right'])
})

it('marks the out-and-back reversal as turnaround', () => {
  // same street both ways would merge; use a named connector to keep them distinct
  const legs2 = buildLegs([step('A St', 0.3, [[0, 0], [0, 1]]), step('B St', 0.3, [[0, 1], [0, 0]])])
  expect(legs2[1].turn).toBe('turnaround')
})
