import { describe, it, expect } from 'vitest'
import { buildWorkoutVariantInput } from '@/lib/workoutVariant'

function fd(entries: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.set(k, v)
  return f
}

const base = {
  name: 'X', category: 'Quality', type: 'Threshold', reason: '', instructions: 'WU',
  distTime: '', energySystem: '', hrZone: '', rpe: '', raceTypes: '', trainingPhases: '',
  hasTurnaround: 'false', turnaround: '',
}

describe('buildWorkoutVariantInput — route metrics (#457)', () => {
  it('parses numeric distance/elevation and JSON geometry', () => {
    const input = buildWorkoutVariantInput(fd({
      ...base, distanceMiles: '10.24', elevationGainFeet: '328', geometry: JSON.stringify({ summaryPolyline: 'p' }),
    }))
    expect(input.distanceMiles).toBe(10.24)
    expect(input.elevationGainFeet).toBe(328)
    expect(input.geometry).toEqual({ summaryPolyline: 'p' })
  })
  it('defaults all three to null when absent or blank', () => {
    const input = buildWorkoutVariantInput(fd({ ...base }))
    expect(input.distanceMiles).toBeNull()
    expect(input.elevationGainFeet).toBeNull()
    expect(input.geometry).toBeNull()
  })
  it('treats a non-numeric distance as null (leader cleared the field)', () => {
    const input = buildWorkoutVariantInput(fd({ ...base, distanceMiles: '' }))
    expect(input.distanceMiles).toBeNull()
  })
  it('preserves an explicit 0 (a flat route), not null', () => {
    const input = buildWorkoutVariantInput(fd({ ...base, distanceMiles: '0', elevationGainFeet: '0' }))
    expect(input.distanceMiles).toBe(0)
    expect(input.elevationGainFeet).toBe(0)
  })
})
