import { describe, it, expect } from 'vitest'
import { parseInferredFields } from '@/lib/workoutInference'

const VALID = {
  distTime: '6 miles',
  energySystem: 'Aerobic',
  hrZone: 'Z3-Z4',
  rpe: '6',
  raceTypes: ['5K'],
  trainingPhases: ['Build'],
  author: 'TigerWolves',
  coachingNotes: 'Stay relaxed through the middle third',
  hasTurnaround: true,
  turnaround: 'After the 2nd 5-min tempo rep',
}

describe('parseInferredFields', () => {
  it('parses a valid JSON response', () => {
    expect(parseInferredFields(JSON.stringify(VALID))).toEqual(VALID)
  })

  it('strips a markdown code fence before parsing', () => {
    const wrapped = '```json\n' + JSON.stringify(VALID) + '\n```'
    expect(parseInferredFields(wrapped)).toEqual(VALID)
  })

  it('throws on malformed JSON', () => {
    expect(() => parseInferredFields('not json')).toThrow()
  })

  it('throws when hasTurnaround is not a boolean', () => {
    const bad = { ...VALID, hasTurnaround: 'yes' }
    expect(() => parseInferredFields(JSON.stringify(bad))).toThrow()
  })

  it('throws when a required field is missing', () => {
    const rest: Partial<typeof VALID> = { ...VALID }
    delete rest.turnaround
    expect(() => parseInferredFields(JSON.stringify(rest))).toThrow()
  })

  it('throws when raceTypes is not an array of strings', () => {
    const bad = { ...VALID, raceTypes: 'Mile, 5K' }
    expect(() => parseInferredFields(JSON.stringify(bad))).toThrow()
  })
})
