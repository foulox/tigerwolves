import { describe, test, expect } from 'vitest'
import { pickerRecordsForRun } from '../lib/libraryPicker'
import type { WorkoutVariantRow, RunConfig } from '../lib/data'

// Minimal variant fixture helper — only fields the function reads are set.
function makeVariant(
  overrides: Pick<WorkoutVariantRow, 'id' | 'familyId' | 'name' | 'label' | 'sortOrder' | 'category' | 'type' | 'runGroupId'>,
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
    lastRan: null,
    ...overrides,
  }
}

// Minimal RunConfig — only `kind` matters for this function.
const workoutConfig: RunConfig = {
  id: 'tuesday-morning-tigerwolves',
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

// A config with no reconciled group (legacy) — exercises the category fallback.
const legacyConfig: RunConfig = {
  ...workoutConfig,
  runGroupId: null,
}

// Group 1 = this run's own workouts (families 10, 20, 30 — spans Quality AND Long).
const g1LadderA = makeVariant({ id: 1, familyId: 10, name: 'Tempo Ladder', label: 'Standard', sortOrder: 1, category: 'Quality', type: 'Ladder', runGroupId: 1 })
const g1LadderB = makeVariant({ id: 2, familyId: 10, name: 'Tempo Ladder', label: 'Longer',   sortOrder: 2, category: 'Quality', type: 'Ladder', runGroupId: 1 })
const g1Hills   = makeVariant({ id: 3, familyId: 20, name: 'Track Repeats', label: null,       sortOrder: 1, category: 'Quality', type: 'Hills',  runGroupId: 1 })
const g1Long    = makeVariant({ id: 4, familyId: 30, name: 'Long Easy',     label: null,       sortOrder: 1, category: 'Long',    type: 'Long',   runGroupId: 1 })
// Group 2 = ANOTHER run's workout — same Quality category, different owner.
const g2Quality = makeVariant({ id: 5, familyId: 40, name: 'Other Run Tempo', label: null,     sortOrder: 1, category: 'Quality', type: 'Straight Tempo', runGroupId: 2 })

const mixedVariants = [g1LadderA, g1LadderB, g1Hills, g1Long, g2Quality]

describe('pickerRecordsForRun', () => {
  test('group scoping — returns only families owned by the run\'s group, across categories', () => {
    const records = pickerRecordsForRun(mixedVariants, workoutConfig) // runGroupId = 1
    const familyIds = records.map(r => r.familyId).sort((a, b) => a - b)
    // All of group 1's families — including the Long family (group scope ignores category)…
    expect(familyIds).toEqual([10, 20, 30])
    // …and NOT the other run's Quality workout, even though it shares the category.
    expect(familyIds).not.toContain(40)
    expect(records.every(r => r.variants.every(v => v.runGroupId === 1))).toBe(true)
  })

  test('legacy fallback — a run with no group falls back to category scoping', () => {
    const records = pickerRecordsForRun(mixedVariants, legacyConfig) // runGroupId = null, kind Workout → Quality
    const familyIds = records.map(r => r.familyId).sort((a, b) => a - b)
    // Every Quality family regardless of owner (10, 20, 40); the Long family (30) is excluded.
    expect(familyIds).toEqual([10, 20, 40])
    expect(records.every(r => r.variants.every(v => v.category === 'Quality'))).toBe(true)
  })

  test('#404 membership scoping — with libraryFamilyIds, returns exactly the run’s library incl. an adopted cross-group route', () => {
    // Library = one created route (family 10, group 1) + one ADOPTED route (family 40,
    // group 2 — another run’s). Membership, not run_group_id, decides visibility now.
    const records = pickerRecordsForRun(mixedVariants, workoutConfig, [10, 40])
    const familyIds = records.map(r => r.familyId).sort((a, b) => a - b)
    expect(familyIds).toEqual([10, 40])
    // Family 20 (owned but NOT in the membership set) is excluded — the junction is
    // authoritative, not run_group_id ownership.
    expect(familyIds).not.toContain(20)
  })

  test('#404 empty membership — a reconciled run with no library rows offers nothing', () => {
    expect(pickerRecordsForRun(mixedVariants, workoutConfig, [])).toEqual([])
  })

  test('family collapse + order — two variants in same family collapse to ONE PickerRecord with Standard→Longer order', () => {
    const records = pickerRecordsForRun(mixedVariants, workoutConfig)
    const family10 = records.find(r => r.familyId === 10)
    expect(family10).toBeDefined()
    expect(family10!.variants).toHaveLength(2)
    expect(family10!.variants.map(v => v.label)).toEqual(['Standard', 'Longer'])
  })
})
