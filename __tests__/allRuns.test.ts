import { describe, test, expect } from 'vitest'
import { computePlatformMap, computeTiers, dbRunToNbrCard, mergeDirectory } from '../lib/allRuns'
import { NBR_RUNS } from '../lib/allRunsData'
import {
  KIND_TO_NBR_CATEGORY,
  NBR_CATEGORY_TO_KIND,
  DAY_FULL_TO_ABBREV,
  DAY_ABBREV_TO_FULL,
  parseStartHour,
} from '../lib/runProfile'

// Legacy link map matching the former NBR_TO_DB_RUN constant (used in legacy tests).
const LEGACY_LINKS: Record<string, string> = {
  'tue-tigerwolves': 'tigerwolves',
  'mon-morning-easy': 'mmer',
}

describe('computePlatformMap — dedup NBR directory ↔ platform runs', () => {
  test('maps NBR entries to platform runs that exist, carrying follow state', () => {
    const map = computePlatformMap(['tigerwolves', 'mmer'], ['tigerwolves'], LEGACY_LINKS, [])
    expect(map['tue-tigerwolves']).toEqual({ runId: 'tigerwolves', following: true, draft: false })
    expect(map['mon-morning-easy']).toEqual({ runId: 'mmer', following: false, draft: false })
  })

  test('ignores a mapping whose target run is not on the platform yet', () => {
    // Only tigerwolves seeded — the mmer mapping must not render as joinable.
    const map = computePlatformMap(['tigerwolves'], [], LEGACY_LINKS, [])
    expect(map['tue-tigerwolves']).toEqual({ runId: 'tigerwolves', following: false, draft: false })
    expect(map['mon-morning-easy']).toBeUndefined()
  })

  test('no platform runs → empty map (logged-out / nothing seeded)', () => {
    expect(computePlatformMap([], [], LEGACY_LINKS, [])).toEqual({})
  })

  test('every mapped platform run corresponds to a real NBR directory entry', () => {
    const nbrIds = new Set(NBR_RUNS.map(r => r.id))
    for (const nbrId of Object.keys(LEGACY_LINKS)) {
      expect(nbrIds.has(nbrId)).toBe(true)
    }
  })

  test('DB-sourced links: linked runs key by directory card id', () => {
    const links = { 'tue-tigerwolves': 'tigerwolves' }
    const map = computePlatformMap(['tigerwolves'], ['tigerwolves'], links, [])
    expect(map['tue-tigerwolves']).toEqual({ runId: 'tigerwolves', following: true, draft: false })
    // The run's own id is NOT used as a key (it's linked to a directory card).
    expect(map['tigerwolves']).toBeUndefined()
  })

  test('unlinked run keys by its own id', () => {
    const links: Record<string, string> = {}
    const map = computePlatformMap(['helkatz'], [], links, [])
    expect(map['helkatz']).toEqual({ runId: 'helkatz', following: false, draft: false })
  })

  test('a link whose target run is not in existingRunIds is ignored', () => {
    // 'mmer' is in links but not in existingRunIds.
    const links = { 'tue-tigerwolves': 'tigerwolves', 'mon-morning-easy': 'mmer' }
    const map = computePlatformMap(['tigerwolves'], [], links, [])
    expect(map['tue-tigerwolves']).toEqual({ runId: 'tigerwolves', following: false, draft: false })
    expect(map['mon-morning-easy']).toBeUndefined()
  })

  test('draft run in draftRunIds stamps draft: true', () => {
    const map = computePlatformMap(['tigerwolves', 'mmer'], [], LEGACY_LINKS, ['mmer'])
    expect(map['mon-morning-easy'].draft).toBe(true)
    expect(map['tue-tigerwolves'].draft).toBe(false)
  })

  test('synthesized (unlinked) draft run carries draft: true', () => {
    const map = computePlatformMap(['helkatz'], [], {}, ['helkatz'])
    expect(map['helkatz']).toEqual({ runId: 'helkatz', following: false, draft: true })
  })
})

describe('computeTiers — following / on-app / more-NBR classification', () => {
  test('sorts runs into the three tiers with no overlap or loss', () => {
    const platform = computePlatformMap(['tigerwolves', 'mmer'], ['tigerwolves'], LEGACY_LINKS, [])
    const { following, onApp, moreNbr } = computeTiers(NBR_RUNS, platform)

    // tigerwolves is followed → Following; mmer is joinable but not joined → On the app.
    expect(following.map(r => r.id)).toEqual(['tue-tigerwolves'])
    expect(onApp.map(r => r.id)).toEqual(['mon-morning-easy'])
    // Everything else is directory-only (not joinable).
    expect(moreNbr).toHaveLength(NBR_RUNS.length - 2)
    expect(moreNbr.some(r => r.id === 'tue-tigerwolves' || r.id === 'mon-morning-easy')).toBe(false)

    // Partition is total.
    expect(following.length + onApp.length + moreNbr.length).toBe(NBR_RUNS.length)
  })

  test('empty platform map → everything is more-NBR (logged out)', () => {
    const { following, onApp, moreNbr } = computeTiers(NBR_RUNS, {})
    expect(following).toHaveLength(0)
    expect(onApp).toHaveLength(0)
    expect(moreNbr).toHaveLength(NBR_RUNS.length)
  })

  test('linked run is sorted into following/onApp (not more-NBR)', () => {
    const links = { 'tue-tigerwolves': 'tigerwolves' }
    const platform = computePlatformMap(['tigerwolves'], ['tigerwolves'], links, [])
    const { following, onApp, moreNbr } = computeTiers(NBR_RUNS, platform)
    expect(following.map(r => r.id)).toContain('tue-tigerwolves')
    expect(onApp.map(r => r.id)).not.toContain('tue-tigerwolves')
    expect(moreNbr.map(r => r.id)).not.toContain('tue-tigerwolves')
  })

  test('unlinked DB run (synthesized card) is sorted into following/onApp — never more-NBR', () => {
    // Synthesized card has id = run's own id ('helkatz').
    // computeTiers checks platform[run.id] so it will find it.
    const platform = computePlatformMap(['helkatz'], [], {}, [])
    const synthesizedCard = dbRunToNbrCard({
      id: 'helkatz',
      name: 'Thursday Helkatz',
      day_of_week: 'Thursday',
      meeting_time: '6:30 AM',
      meeting_location: 'Willowbridge',
      kind: 'Workout',
      emoji: '🐈',
      nbr_directory_id: null,
    })
    const { following, onApp, moreNbr } = computeTiers([synthesizedCard], platform)
    expect(onApp.map(r => r.id)).toContain('helkatz')
    expect(moreNbr.map(r => r.id)).not.toContain('helkatz')
    expect(following).toHaveLength(0)
  })
})

describe('dbRunToNbrCard — DB row → NBRRun card', () => {
  const baseRow = {
    id: 'helkatz',
    name: 'Thursday Helkatz',
    day_of_week: 'Thursday',
    meeting_time: '6:30 AM',
    meeting_location: 'Willowbridge',
    kind: 'Workout',
    emoji: '🐈',
    nbr_directory_id: null,
  }

  test('maps day_of_week (full name) to day abbreviation', () => {
    expect(dbRunToNbrCard(baseRow).day).toBe('thu')
  })

  test('maps kind to NBR category', () => {
    expect(dbRunToNbrCard(baseRow).category).toBe('Workouts')
  })

  test('maps meeting_time to startTime and startHour', () => {
    const card = dbRunToNbrCard(baseRow)
    expect(card.startTime).toBe('6:30 AM')
    expect(card.startHour).toBe(6.5)
  })

  test('maps meeting_location to location', () => {
    expect(dbRunToNbrCard(baseRow).location).toBe('Willowbridge')
  })

  test('distance is always empty string (no distance in DB schema)', () => {
    expect(dbRunToNbrCard(baseRow).distance).toBe('')
  })

  test('id and name pass through unchanged', () => {
    const card = dbRunToNbrCard(baseRow)
    expect(card.id).toBe('helkatz')
    expect(card.name).toBe('Thursday Helkatz')
  })

  test('null day_of_week falls back to mon', () => {
    expect(dbRunToNbrCard({ ...baseRow, day_of_week: null }).day).toBe('mon')
  })

  test('null kind falls back to Easy Runs category', () => {
    expect(dbRunToNbrCard({ ...baseRow, kind: null }).category).toBe('Easy Runs')
  })

  test('Easy kind maps to Easy Runs', () => {
    expect(dbRunToNbrCard({ ...baseRow, kind: 'Easy' }).category).toBe('Easy Runs')
  })

  test('null meeting_location falls back to empty string', () => {
    expect(dbRunToNbrCard({ ...baseRow, meeting_location: null }).location).toBe('')
  })
})

describe('parseStartHour — display time → 24h float', () => {
  test('"6:30 AM" parses to 6.5 (DB format with space + uppercase)', () => {
    expect(parseStartHour('6:30 AM')).toBe(6.5)
  })

  test('"6:30am" parses to 6.5 (NBR static data format)', () => {
    expect(parseStartHour('6:30am')).toBe(6.5)
  })

  test('"7:00 PM" parses to 19', () => {
    expect(parseStartHour('7:00 PM')).toBe(19)
  })

  test('"7pm" parses to 19 (no colon/minutes form)', () => {
    expect(parseStartHour('7pm')).toBe(19)
  })

  test('"12:00 PM" parses to 12 (noon)', () => {
    expect(parseStartHour('12:00 PM')).toBe(12)
  })

  test('"12:00 AM" parses to 0 (midnight)', () => {
    expect(parseStartHour('12:00 AM')).toBe(0)
  })

  test('unparseable string returns 99 (sorts last)', () => {
    expect(parseStartHour('not a time')).toBe(99)
  })

  test('null returns 99', () => {
    expect(parseStartHour(null)).toBe(99)
  })

  test('undefined returns 99', () => {
    expect(parseStartHour(undefined)).toBe(99)
  })

  test('empty string returns 99', () => {
    expect(parseStartHour('')).toBe(99)
  })
})

describe('KIND_TO_NBR_CATEGORY and NBR_CATEGORY_TO_KIND maps', () => {
  test('KIND_TO_NBR_CATEGORY maps all RUN_KINDS to NBR categories', () => {
    expect(KIND_TO_NBR_CATEGORY['Beginner-Friendly']).toBe('Beginner-Friendly')
    expect(KIND_TO_NBR_CATEGORY['Easy']).toBe('Easy Runs')
    expect(KIND_TO_NBR_CATEGORY['Long']).toBe('Long Runs')
    expect(KIND_TO_NBR_CATEGORY['Food']).toBe('Food Runs')
    expect(KIND_TO_NBR_CATEGORY['Workout']).toBe('Workouts')
  })

  test('NBR_CATEGORY_TO_KIND is the inverse of KIND_TO_NBR_CATEGORY', () => {
    for (const [kind, category] of Object.entries(KIND_TO_NBR_CATEGORY)) {
      expect(NBR_CATEGORY_TO_KIND[category as keyof typeof NBR_CATEGORY_TO_KIND]).toBe(kind)
    }
  })
})

describe('DAY_FULL_TO_ABBREV and DAY_ABBREV_TO_FULL maps', () => {
  test('DAY_FULL_TO_ABBREV maps all full day names to abbreviations', () => {
    expect(DAY_FULL_TO_ABBREV['Monday']).toBe('mon')
    expect(DAY_FULL_TO_ABBREV['Tuesday']).toBe('tue')
    expect(DAY_FULL_TO_ABBREV['Wednesday']).toBe('wed')
    expect(DAY_FULL_TO_ABBREV['Thursday']).toBe('thu')
    expect(DAY_FULL_TO_ABBREV['Friday']).toBe('fri')
    expect(DAY_FULL_TO_ABBREV['Saturday']).toBe('sat')
    expect(DAY_FULL_TO_ABBREV['Sunday']).toBe('sun')
  })

  test('DAY_ABBREV_TO_FULL is the inverse of DAY_FULL_TO_ABBREV', () => {
    for (const [full, abbrev] of Object.entries(DAY_FULL_TO_ABBREV)) {
      expect(DAY_ABBREV_TO_FULL[abbrev as keyof typeof DAY_ABBREV_TO_FULL]).toBe(full)
    }
  })

  test('covers all 7 days in both directions', () => {
    expect(Object.keys(DAY_FULL_TO_ABBREV)).toHaveLength(7)
    expect(Object.keys(DAY_ABBREV_TO_FULL)).toHaveLength(7)
  })
})

describe('mergeDirectory — NBR cards + unlinked DB run synthesis', () => {
  const linkedDbRun = {
    id: 'tigerwolves',
    name: 'TigerWolves',
    day_of_week: 'Tuesday',
    meeting_time: '6:30 AM',
    meeting_location: 'McCarren Park',
    kind: 'Workout',
    emoji: '🐯',
    nbr_directory_id: 'tue-tigerwolves',
  }

  const unlinkedDbRun = {
    id: 'helkatz',
    name: 'Thursday Helkatz',
    day_of_week: 'Thursday',
    meeting_time: '6:30 AM',
    meeting_location: 'Willowbridge',
    kind: 'Workout',
    emoji: '🐈',
    nbr_directory_id: null,
  }

  test('a linked DB run is not synthesized — directory card count unchanged', () => {
    const links = { 'tue-tigerwolves': 'tigerwolves' }
    const merged = mergeDirectory(NBR_RUNS, [linkedDbRun], links)
    // No duplicate: count is same as NBR_RUNS (no extra card appended)
    expect(merged).toHaveLength(NBR_RUNS.length)
    // The existing directory card is still there
    expect(merged.some(r => r.id === 'tue-tigerwolves')).toBe(true)
    // The DB run's own id is not a separate card
    expect(merged.some(r => r.id === 'tigerwolves')).toBe(false)
  })

  test('an unlinked DB run is appended as a synthesized card', () => {
    const merged = mergeDirectory(NBR_RUNS, [unlinkedDbRun], {})
    expect(merged).toHaveLength(NBR_RUNS.length + 1)
    expect(merged.at(-1)?.id).toBe('helkatz')
  })

  test('NBR directory cards always come first (deterministic order)', () => {
    const merged = mergeDirectory(NBR_RUNS, [unlinkedDbRun], {})
    // First N cards are exactly NBR_RUNS in original order
    expect(merged.slice(0, NBR_RUNS.length).map(r => r.id)).toEqual(NBR_RUNS.map(r => r.id))
    // Synthesized card is appended last
    expect(merged.at(-1)?.id).toBe('helkatz')
  })

  test('mixed: linked run dedups, unlinked run appends', () => {
    const links = { 'tue-tigerwolves': 'tigerwolves' }
    const merged = mergeDirectory(NBR_RUNS, [linkedDbRun, unlinkedDbRun], links)
    // One synthesized card added (helkatz), linked tigerwolves did not add an extra card
    expect(merged).toHaveLength(NBR_RUNS.length + 1)
    expect(merged.some(r => r.id === 'helkatz')).toBe(true)
    expect(merged.some(r => r.id === 'tigerwolves')).toBe(false)
  })

  test('computeTiers then places a synthesized card in following/onApp — never more-NBR', () => {
    const merged = mergeDirectory(NBR_RUNS, [unlinkedDbRun], {})
    const links: Record<string, string> = {}
    const platform = computePlatformMap(['helkatz'], [], links, [])
    const { following, onApp, moreNbr } = computeTiers(merged, platform)
    expect(onApp.map(r => r.id)).toContain('helkatz')
    expect(moreNbr.map(r => r.id)).not.toContain('helkatz')
    expect(following).toHaveLength(0)
  })
})

describe('legacy link resolution — AC3 no-regression', () => {
  test('both legacy NBR cards light up when their runs exist', () => {
    const links = { 'tue-tigerwolves': 'tigerwolves', 'mon-morning-easy': 'mmer' }
    const map = computePlatformMap(['tigerwolves', 'mmer'], ['tigerwolves'], links, [])
    expect(map['tue-tigerwolves']).toEqual({ runId: 'tigerwolves', following: true, draft: false })
    expect(map['mon-morning-easy']).toEqual({ runId: 'mmer', following: false, draft: false })
  })

  test('legacy links via computeTiers place both NBR cards in following/onApp', () => {
    const links = { 'tue-tigerwolves': 'tigerwolves', 'mon-morning-easy': 'mmer' }
    const platform = computePlatformMap(['tigerwolves', 'mmer'], ['tigerwolves'], links, [])
    const { following, onApp, moreNbr } = computeTiers(NBR_RUNS, platform)
    expect(following.map(r => r.id)).toContain('tue-tigerwolves')
    expect(onApp.map(r => r.id)).toContain('mon-morning-easy')
    expect(moreNbr.map(r => r.id)).not.toContain('tue-tigerwolves')
    expect(moreNbr.map(r => r.id)).not.toContain('mon-morning-easy')
  })
})
