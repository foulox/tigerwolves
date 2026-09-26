import { describe, test, expect } from 'vitest'
import { formatMeetingTimeShort, directoryRunToCard, cardAffordance } from '../lib/allRuns'
import {
  KIND_TO_NBR_CATEGORY,
  NBR_CATEGORY_TO_KIND,
  DAY_FULL_TO_ABBREV,
  DAY_ABBREV_TO_FULL,
  parseStartHour,
} from '../lib/runProfile'

describe('formatMeetingTimeShort', () => {
  test("'6:30 AM' → '6:30am'", () => expect(formatMeetingTimeShort('6:30 AM')).toBe('6:30am'))
  test("'6:00am' passes through", () => expect(formatMeetingTimeShort('6:00am')).toBe('6:00am'))
  test("'7:00 PM' → '7:00pm'", () => expect(formatMeetingTimeShort('7:00 PM')).toBe('7:00pm'))
  test('null → empty', () => expect(formatMeetingTimeShort(null)).toBe(''))
  test('empty → empty', () => expect(formatMeetingTimeShort('')).toBe(''))
})

const row = (o: Record<string, unknown> = {}) => ({ id: 'tue-bushwick', name: 'Tuesday Bushwick Run', day_of_week: 'Tuesday',
  meeting_time: '7:00am', meeting_location: 'Maria Hernandez Park', kind: 'Easy', emoji: null,
  distance: '4–6 mi', status: 'unclaimed' as const, ...o })

describe('directoryRunToCard', () => {
  test('maps DB row to a card keyed on run.id, with status + distance', () => {
    const c = directoryRunToCard(row())
    expect(c.id).toBe('tue-bushwick')
    expect(c.day).toBe('tue'); expect(c.category).toBe('Easy Runs')
    expect(c.startTime).toBe('7:00am'); expect(c.startHour).toBe(7)
    expect(c.distance).toBe('4–6 mi'); expect(c.status).toBe('unclaimed')
  })
  test('normalizes DB-format meeting_time', () => {
    expect(directoryRunToCard(row({ id: 'tigerwolves', meeting_time: '6:30 AM' })).startTime).toBe('6:30am')
  })
})

const viewer = (o: Record<string, unknown> = {}) => ({ isLoggedIn: true, isAdmin: false, owningLeaderRunId: null, followedRunIds: [], ...o })

describe('cardAffordance', () => {
  test('live: visible, linkable everyone, joinable when logged in', () => {
    const a = cardAffordance({ id: 'x', status: 'live' }, viewer())
    expect(a).toMatchObject({ visible: true, linkable: true, joinable: true, showDraftBadge: false })
  })
  test('live linkable even when logged out', () => {
    expect(cardAffordance({ id: 'x', status: 'live' }, viewer({ isLoggedIn: false })).linkable).toBe(true)
  })
  test('unclaimed: visible, never joinable/linkable', () => {
    expect(cardAffordance({ id: 'x', status: 'unclaimed' }, viewer())).toMatchObject({ visible: true, joinable: false, linkable: false })
  })
  test('draft for a plain runner: visible but inert', () => {
    expect(cardAffordance({ id: 'd', status: 'draft' }, viewer())).toMatchObject({ visible: true, joinable: false, linkable: false, showDraftBadge: false })
  })
  test('draft hidden from anonymous', () => {
    expect(cardAffordance({ id: 'd', status: 'draft' }, viewer({ isLoggedIn: false })).visible).toBe(false)
  })
  test('draft for the owning leader: managed', () => {
    expect(cardAffordance({ id: 'd', status: 'draft' }, viewer({ owningLeaderRunId: 'd' })))
      .toMatchObject({ visible: true, joinable: true, linkable: true, showDraftBadge: true })
  })
  test('draft for an admin: managed for any draft', () => {
    expect(cardAffordance({ id: 'd', status: 'draft' }, viewer({ isAdmin: true })))
      .toMatchObject({ joinable: true, linkable: true, showDraftBadge: true })
  })
  test('following reflects the followed set', () => {
    expect(cardAffordance({ id: 'x', status: 'live' }, viewer({ followedRunIds: ['x'] })).following).toBe(true)
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
