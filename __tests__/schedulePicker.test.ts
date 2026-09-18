import { describe, test, expect } from 'vitest'
import {
  schedulePickerScope,
  schedulePickerSuggestions,
  allRunsCategories,
  allRunsTypes,
} from '../lib/schedulePicker'
import type { WorkoutVariantRow } from '../lib/data'

// Minimal variant fixture — only the fields the picker helpers read are set.
function makeVariant(
  o: Pick<WorkoutVariantRow, 'id' | 'familyId' | 'name' | 'category' | 'type' | 'runGroupId'> &
    Partial<Pick<WorkoutVariantRow, 'lastRan' | 'label'>>,
): WorkoutVariantRow {
  return {
    label: null,
    sortOrder: 1,
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
    ...o,
  }
}

// TigerWolves' library (own + adopted): a Hills Quality workout and a Ladder Quality
// workout. group 1 = TigerWolves.
const twHills = makeVariant({ id: 1, familyId: 10, name: 'Fort Greene Hills', category: 'Quality', type: 'Hills', runGroupId: 1, lastRan: '2026-01-01' })
const twLadder = makeVariant({ id: 2, familyId: 20, name: 'Track Ladder', category: 'Quality', type: 'Ladder', runGroupId: 1, lastRan: '2026-03-01' })
// MMER's Easy workout — another run's, off-type for TigerWolves, NOT in its library.
const mmerEasy = makeVariant({ id: 3, familyId: 30, name: 'McCarren Easy Loop', category: 'Easy', type: 'Easy', runGroupId: 2, lastRan: '2026-02-01' })
// Doves' Long route — a third run's, a third category.
const dovesLong = makeVariant({ id: 4, familyId: 40, name: 'Waterfront Long', category: 'Long', type: 'Progressive', runGroupId: 3, lastRan: null })

const allVariants = [twHills, twLadder, mmerEasy, dovesLong]
const ownVariants = [twHills, twLadder] // TigerWolves' library only

describe('schedulePickerScope', () => {
  test('"Your run" scope is the run library; "All runs" is the full catalog (AC3)', () => {
    expect(schedulePickerScope(false, ownVariants, allVariants)).toEqual(ownVariants)
    expect(schedulePickerScope(true, ownVariants, allVariants)).toEqual(allVariants)
  })
})

describe('schedulePickerSuggestions — "Your run" mode (regression, AC2/AC8)', () => {
  const base = {
    showAllRuns: false,
    ownVariants,
    allVariants,
    isWorkout: true,
    runCategory: 'Quality' as string | null,
    browseCategory: null,
    browseType: null,
    plannedId: null,
  }

  test('a Workout run offers only its library workouts of the week type(s)', () => {
    const out = schedulePickerSuggestions({ ...base, weekTypes: ['Hills'] })
    expect(out.map(w => w.id)).toEqual([1]) // only the Hills library workout
  })

  test('another run\'s off-type workout is never offered in "Your run" mode', () => {
    const out = schedulePickerSuggestions({ ...base, weekTypes: ['Easy'] })
    expect(out.map(w => w.id)).not.toContain(3) // MMER's Easy loop stays hidden
    expect(out).toEqual([]) // TigerWolves has no Easy-type library workout
  })

  test('a non-Workout run offers its whole category from the library', () => {
    const out = schedulePickerSuggestions({ ...base, isWorkout: false, runCategory: 'Quality', weekTypes: [] })
    expect(out.map(w => w.id).sort()).toEqual([1, 2])
  })
})

describe('schedulePickerSuggestions — "All runs" mode (AC3/AC4)', () => {
  const base = {
    showAllRuns: true,
    ownVariants,
    allVariants,
    isWorkout: true,
    runCategory: 'Quality' as string | null,
    weekTypes: ['Hills'],
    plannedId: null,
  }

  test('draws from every run with no run-scope and no week-type restriction', () => {
    const out = schedulePickerSuggestions({ ...base, browseCategory: null, browseType: null })
    // Every run's workout, ordered least-recently-used first (null lastRan sorts first).
    expect(out.map(w => w.id)).toEqual([4, 1, 3, 2])
  })

  test('narrows to the selected browse category across all runs', () => {
    const out = schedulePickerSuggestions({ ...base, browseCategory: 'Easy', browseType: null })
    expect(out.map(w => w.id)).toEqual([3]) // MMER's Easy loop — a cross-run borrow candidate
  })

  test('narrows to the selected browse type across all runs', () => {
    const out = schedulePickerSuggestions({ ...base, browseCategory: null, browseType: 'Progressive' })
    expect(out.map(w => w.id)).toEqual([4])
  })

  test('excludes the already-planned workout', () => {
    const out = schedulePickerSuggestions({ ...base, browseCategory: null, browseType: null, plannedId: 1 })
    expect(out.map(w => w.id)).not.toContain(1)
  })
})

describe('all-runs filter options (AC4)', () => {
  test('categories list every category present across all runs', () => {
    expect(allRunsCategories(allVariants)).toEqual(['Easy', 'Long', 'Quality'])
  })

  test('types list every type across all runs, or narrowed to a category', () => {
    expect(allRunsTypes(allVariants, null)).toEqual(['Easy', 'Hills', 'Ladder', 'Progressive'])
    expect(allRunsTypes(allVariants, 'Quality')).toEqual(['Hills', 'Ladder'])
  })
})
