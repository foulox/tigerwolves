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
      distanceMiles: null,
      elevationGainFeet: null,
      geometry: null,
      mapImageUrl: null,
      routeNarrative: null,
      runGroupId: 3,
      hasTurnaround: true,
      turnaround: 'After the 2nd rep',
      label: null,
      sortOrder: null,
    })
  })

  it('parses label and sortOrder when present (#277 — variant rename)', () => {
    const input = buildWorkoutVariantInput(formData({ ...VALID_FIELDS, label: 'Shorter version', sortOrder: '2' }))
    expect(input.label).toBe('Shorter version')
    expect(input.sortOrder).toBe(2)
  })

  it('defaults label and sortOrder to null when absent', () => {
    const input = buildWorkoutVariantInput(formData(VALID_FIELDS))
    expect(input.label).toBeNull()
    expect(input.sortOrder).toBeNull()
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

  it('parses a Long workout whose type is "Long" (#473)', () => {
    const input = buildWorkoutVariantInput(formData({ ...VALID_FIELDS, category: 'Long', type: 'Long', instructions: '' }))
    expect(input.category).toBe('Long')
    expect(input.type).toBe('Long')
  })

  it('parses an Easy workout whose type is "Easy" (#473)', () => {
    const input = buildWorkoutVariantInput(formData({ ...VALID_FIELDS, category: 'Easy', type: 'Easy', instructions: '' }))
    expect(input.category).toBe('Easy')
    expect(input.type).toBe('Easy')
  })

  it('throws when the type is not valid for the selected category (#473)', () => {
    // "Threshold" is a Quality type — invalid on a Long run
    expect(() => buildWorkoutVariantInput(formData({ ...VALID_FIELDS, category: 'Long', type: 'Threshold' }))).toThrow()
    // "Long" is not a Quality type
    expect(() => buildWorkoutVariantInput(formData({ ...VALID_FIELDS, category: 'Quality', type: 'Long' }))).toThrow()
  })

  it('throws when instructions is blank for a Quality workout', () => {
    expect(() => buildWorkoutVariantInput(formData({ ...VALID_FIELDS, category: 'Quality', instructions: '' }))).toThrow()
  })

  it('allows blank instructions for a Long workout (#469)', () => {
    const input = buildWorkoutVariantInput(formData({ ...VALID_FIELDS, category: 'Long', type: 'Long', instructions: '' }))
    expect(input.instructions).toBe('')
    expect(input.category).toBe('Long')
  })

  it('allows blank instructions for an Easy workout (#469)', () => {
    const input = buildWorkoutVariantInput(formData({ ...VALID_FIELDS, category: 'Easy', type: 'Easy', instructions: '' }))
    expect(input.instructions).toBe('')
  })

  it('still throws for a Quality workout with whitespace-only instructions (#469)', () => {
    expect(() => buildWorkoutVariantInput(formData({ ...VALID_FIELDS, category: 'Quality', instructions: '   ' }))).toThrow()
  })

  it('hasTurnaround is false for any value other than the string "true"', () => {
    const input = buildWorkoutVariantInput(formData({ ...VALID_FIELDS, hasTurnaround: 'false' }))
    expect(input.hasTurnaround).toBe(false)
  })
})
