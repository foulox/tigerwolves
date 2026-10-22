// __tests__/recurrence.test.ts
import { describe, it, expect } from 'vitest'
import { occursOn, occurrencesBetween, describeRecurrence } from '../lib/recurrence'

// Weekly-default (no rrule) falls back to day_of_week.
const weeklyTue = { rrule: null, dtstart: null, dayOfWeek: 'Tuesday' }
// Second-Friday-monthly, anchored on a Friday that is NOT the 2nd Friday,
// to prove the rule — not the anchor's weekday-position — drives occurrence.
const secondFri = { rrule: 'FREQ=MONTHLY;BYDAY=2FR', dtstart: '2020-01-03', dayOfWeek: 'Friday' }
// Fifth-Friday-monthly: most months have no 5th Friday.
const fifthFri = { rrule: 'FREQ=MONTHLY;BYDAY=5FR', dtstart: '2020-01-03', dayOfWeek: 'Friday' }
// Every-other-Tuesday, phase anchored 2026-09-29 (a Tuesday).
const biweeklyTue = { rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU', dtstart: '2026-09-29', dayOfWeek: 'Tuesday' }

describe('occursOn — weekly default (null rrule)', () => {
  it('occurs on its day_of_week every week', () => {
    expect(occursOn(weeklyTue, '2026-10-20')).toBe(true)  // Tuesday
    expect(occursOn(weeklyTue, '2026-10-27')).toBe(true)  // next Tuesday
  })
  it('does not occur on other weekdays', () => {
    expect(occursOn(weeklyTue, '2026-10-21')).toBe(false) // Wednesday
  })
  it('returns false when both rrule and day_of_week are null', () => {
    expect(occursOn({ rrule: null, dtstart: null, dayOfWeek: null }, '2026-10-20')).toBe(false)
  })
})

describe('occursOn — monthly nth weekday', () => {
  it('occurs only on the 2nd Friday', () => {
    expect(occursOn(secondFri, '2026-10-09')).toBe(true)  // 2nd Friday of Oct 2026
    expect(occursOn(secondFri, '2026-10-02')).toBe(false) // 1st Friday
    expect(occursOn(secondFri, '2026-10-16')).toBe(false) // 3rd Friday
  })
  it('follows the rule, not the dtstart weekday-position', () => {
    // dtstart 2020-01-03 is the 1st Friday of Jan 2020; rule still means 2nd Friday.
    expect(occursOn(secondFri, '2020-01-10')).toBe(true)  // 2nd Friday Jan 2020
    expect(occursOn(secondFri, '2020-01-03')).toBe(false) // the anchor itself (1st Friday)
  })
  it('produces no occurrence in a month without a 5th Friday', () => {
    // Oct 2026 has 5 Fridays (2,9,16,23,30); Nov 2026 has only 4.
    expect(occursOn(fifthFri, '2026-10-30')).toBe(true)
    expect(occursOn(fifthFri, '2026-11-27')).toBe(false) // 4th & last Friday of Nov
  })
})

describe('occursOn — one-time (COUNT=1)', () => {
  const onceOnly = { rrule: 'FREQ=DAILY;COUNT=1', dtstart: '2026-11-05', dayOfWeek: 'Thursday' }
  it('occurs only on its single anchored date', () => {
    expect(occursOn(onceOnly, '2026-11-05')).toBe(true)
    expect(occursOn(onceOnly, '2026-11-12')).toBe(false)
    expect(occursOn(onceOnly, '2026-11-06')).toBe(false)
  })
})

describe('occursOn — biweekly phase + DST', () => {
  it('respects the every-other-week phase from dtstart', () => {
    expect(occursOn(biweeklyTue, '2026-09-29')).toBe(true)
    expect(occursOn(biweeklyTue, '2026-10-06')).toBe(false) // odd week
    expect(occursOn(biweeklyTue, '2026-10-13')).toBe(true)  // even week
  })
  it('is stable across a US DST boundary (arithmetic is UTC)', () => {
    // 2026-03-08 is US spring-forward; a Sunday, so a Tuesday rule must still say false,
    // and the following Tuesday true — no off-by-one from the clock shift.
    const weeklySun = { rrule: null, dtstart: null, dayOfWeek: 'Sunday' }
    expect(occursOn(weeklySun, '2026-03-08')).toBe(true)
    expect(occursOn(weeklyTue, '2026-03-10')).toBe(true)
  })
})

describe('occurrencesBetween', () => {
  it('lists weekly-default occurrences inclusive of both ends', () => {
    expect(occurrencesBetween(weeklyTue, '2026-10-19', '2026-10-27')).toEqual(['2026-10-20', '2026-10-27'])
  })
  it('lists only the matching monthly date inside a window', () => {
    expect(occurrencesBetween(secondFri, '2026-10-05', '2026-10-11')).toEqual(['2026-10-09'])
    expect(occurrencesBetween(secondFri, '2026-10-12', '2026-10-18')).toEqual([])
  })
})

describe('describeRecurrence', () => {
  it('returns null for a weekly-default run (no rrule)', () => {
    expect(describeRecurrence(weeklyTue)).toBeNull()
  })
  it('renders a human label for a monthly rule', () => {
    // rrule.js toText wording; assert the meaningful tokens rather than exact punctuation.
    const text = describeRecurrence(secondFri)!
    expect(text.toLowerCase()).toContain('month')
    expect(text.toLowerCase()).toContain('2nd')
    expect(text.toLowerCase()).toContain('friday')
  })
})
