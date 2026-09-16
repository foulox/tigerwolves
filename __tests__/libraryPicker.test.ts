import { describe, test, expect } from 'vitest'
import { pickerRecordsForRun } from '../lib/libraryPicker'
import type { WorkoutVariantRow, RunConfig } from '../lib/data'

// Minimal variant fixture helper — only fields the function reads are set.
function makeVariant(
  overrides: Pick<WorkoutVariantRow, 'id' | 'familyId' | 'name' | 'label' | 'sortOrder' | 'category' | 'type'>,
): WorkoutVariantRow {
  return {
    reason: '',
    rawInput: '',
    distTime: '',
    energySystem: '',
    hrZone: '',
    rpe: '',
    coachingNotes: null,
    mapLink: null,
    author: null,
    raceTypes: [],
    trainingPhases: [],
    hasTurnaround: false,
    turnaround: '',
    flagged: false,
    flagNote: '',
    runGroupId: null,
    lastRan: null,
    ...overrides,
  }
}

// Minimal RunConfig — only `kind` matters for this function.
const workoutConfig: RunConfig = {
  id: 'tigerwolves',
  name: 'TigerWolves',
  emoji: '🐯🐺',
  dayOfWeek: 'Tuesday',
  meetingLocation: '',
  postHeader: '',
  leaderIntro: '',
  closingNotes: '',
  kind: 'Workout',
  workoutTypes: ['Hills', 'Ladder'],
  runGroupId: 1,
  cycleMode: 'none',
  cycle: {},
  status: 'live',
  postTemplate: null,
}

const longConfig: RunConfig = {
  ...workoutConfig,
  kind: 'Long',
  workoutTypes: [],
}

// Shared mixed-category variants used across tests.
const qualityVariantA = makeVariant({ id: 1, familyId: 10, name: 'Tempo Ladder', label: 'Standard', sortOrder: 1, category: 'Quality', type: 'Ladder' })
const qualityVariantB = makeVariant({ id: 2, familyId: 10, name: 'Tempo Ladder', label: 'Longer',   sortOrder: 2, category: 'Quality', type: 'Ladder' })
const qualityVariantC = makeVariant({ id: 3, familyId: 20, name: 'Track Repeats', label: null,      sortOrder: 1, category: 'Quality', type: 'Hills'  })
const longVariantA    = makeVariant({ id: 4, familyId: 30, name: 'Long Easy', label: null,           sortOrder: 1, category: 'Long',    type: 'Long'   })

const mixedVariants = [qualityVariantA, qualityVariantB, qualityVariantC, longVariantA]

describe('pickerRecordsForRun', () => {
  test('type filter — Workout run returns only Quality families; Long run returns only Long families', () => {
    const qualityRecords = pickerRecordsForRun(mixedVariants, workoutConfig)
    expect(qualityRecords.every(r => r.variants.every(v => v.category === 'Quality'))).toBe(true)
    expect(qualityRecords.map(r => r.familyId)).toEqual(expect.arrayContaining([10, 20]))
    expect(qualityRecords.map(r => r.familyId)).not.toContain(30)

    const longRecords = pickerRecordsForRun(mixedVariants, longConfig)
    expect(longRecords.map(r => r.familyId)).toEqual([30])
    expect(longRecords.every(r => r.variants.every(v => v.category === 'Long'))).toBe(true)
    expect(longRecords.map(r => r.familyId)).not.toContain(10)
    expect(longRecords.map(r => r.familyId)).not.toContain(20)
  })

  test('family collapse + order — two variants in same family collapse to ONE PickerRecord with Standard→Longer order', () => {
    const records = pickerRecordsForRun(mixedVariants, workoutConfig)
    const family10 = records.find(r => r.familyId === 10)
    expect(family10).toBeDefined()
    expect(family10!.variants).toHaveLength(2)
    expect(family10!.variants.map(v => v.label)).toEqual(['Standard', 'Longer'])
  })
})
