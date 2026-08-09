import { describe, it, expect } from 'vitest'
import { buildWorkoutVariantInput } from '@/lib/workoutVariant'

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

const VALID_FIELDS = {
  name: 'Broken Tempo',
  category: 'Quality',
  type: 'Threshold',
  reason: 'Builds lactate threshold',
  instructions: 'WU: 15 min easy. Main: 3x10min@tempo r2min jog. CD: 10 min.',
  distTime: '6-8 miles',
  energySystem: 'Lactate Threshold',
  hrZone: 'Z3-Z4',
  rpe: '7',
  raceTypes: 'Half, Full',
  trainingPhases: 'Build',
  author: 'TigerWolves',
  coachingNotes: 'Hold steady effort',
  mapLink: 'https://strava.com/routes/1',
  runGroupId: '3',
  hasTurnaround: 'true',
  turnaround: 'After the 2nd rep',
}

describe('buildWorkoutVariantInput', () => {
  it('parses a fully populated form into a WorkoutVariantInput', () => {
    const input = buildWorkoutVariantInput(formData(VALID_FIELDS))
    expect(input).toEqual({
      name: 'Broken Tempo',
      category: 'Quality',
      type: 'Threshold',
      reason: 'Builds lactate threshold',
      instructions: 'WU: 15 min easy. Main: 3x10min@tempo r2min jog. CD: 10 min.',
      distTime: '6-8 miles',
      energySystem: 'Lactate Threshold',
      hrZone: 'Z3-Z4',
      rpe: '7',
      raceTypes: ['Half', 'Full'],
      trainingPhases: ['Build'],
      author: 'TigerWolves',
      coachingNotes: 'Hold steady effort',
      mapLink: 'https://strava.com/routes/1',
      runGroupId: 3,
      hasTurnaround: true,
      turnaround: 'After the 2nd rep',
    })
  })

  it('defaults empty optional fields to null', () => {
    const input = buildWorkoutVariantInput(formData({ ...VALID_FIELDS, author: '', coachingNotes: '', mapLink: '', runGroupId: '' }))
    expect(input.author).toBeNull()
    expect(input.coachingNotes).toBeNull()
    expect(input.mapLink).toBeNull()
    expect(input.runGroupId).toBeNull()
  })

  it('throws when category is not one of the known categories', () => {
    expect(() => buildWorkoutVariantInput(formData({ ...VALID_FIELDS, category: 'Weird' }))).toThrow()
  })

  it('throws when type is not one of the known types', () => {
    expect(() => buildWorkoutVariantInput(formData({ ...VALID_FIELDS, type: 'Made Up Type' }))).toThrow()
  })

  it('throws when instructions is blank', () => {
    expect(() => buildWorkoutVariantInput(formData({ ...VALID_FIELDS, instructions: '' }))).toThrow()
  })

  it('hasTurnaround is false for any value other than the string "true"', () => {
    const input = buildWorkoutVariantInput(formData({ ...VALID_FIELDS, hasTurnaround: 'false' }))
    expect(input.hasTurnaround).toBe(false)
  })
})
