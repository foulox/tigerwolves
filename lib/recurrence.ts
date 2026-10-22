// lib/recurrence.ts
// #448: the single recurrence seam. Wraps rrule.js so display (#448),
// schedule generation (#449), and retire filtering reuse ONE occurrence
// predicate. A run with no `rrule` defaults to weekly-on-`day_of_week`
// (back-compat). Server-side only — do NOT import from a 'use client' module.
//
// All arithmetic is UTC: rrule.js is timezone-sensitive, so we anchor dtstart
// at UTC midnight and query with UTC-midnight dates, keeping the predicate
// deterministic regardless of the server's local zone or DST.
import { RRule } from 'rrule'

export type RecurrenceRun = {
  rrule: string | null
  dtstart: string | null
  dayOfWeek: string | null
}

const DOW_TO_UTCDAY: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
}

// "2026-10-09" -> Date at UTC midnight. Avoids local-tz drift.
function utcMidnight(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function toYmd(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Build an RRule from the stored rule + anchor. Throws if rrule.js rejects
// either — callers that read untrusted stored values must catch.
function buildRule(rruleStr: string, dtstart: string): RRule {
  const options = RRule.parseString(rruleStr)
  options.dtstart = utcMidnight(dtstart)
  return new RRule(options)
}

export function occursOn(run: RecurrenceRun, ymd: string): boolean {
  if (!run.rrule) {
    // Weekly default: occurs iff the date's weekday matches day_of_week.
    if (!run.dayOfWeek) return false
    const target = DOW_TO_UTCDAY[run.dayOfWeek]
    if (target === undefined) return false
    return utcMidnight(ymd).getUTCDay() === target
  }
  const rule = buildRule(run.rrule, run.dtstart ?? ymd)
  const day = utcMidnight(ymd)
  return rule.between(day, day, true).length > 0
}

export function occurrencesBetween(
  run: RecurrenceRun,
  startYmd: string,
  endYmd: string,
): string[] {
  if (!run.rrule) {
    // Enumerate matching weekdays in the window without rrule.js.
    if (!run.dayOfWeek || DOW_TO_UTCDAY[run.dayOfWeek] === undefined) return []
    const out: string[] = []
    for (let d = utcMidnight(startYmd); toYmd(d) <= endYmd; d.setUTCDate(d.getUTCDate() + 1)) {
      if (d.getUTCDay() === DOW_TO_UTCDAY[run.dayOfWeek]) out.push(toYmd(d))
    }
    return out
  }
  const rule = buildRule(run.rrule, run.dtstart ?? startYmd)
  return rule.between(utcMidnight(startYmd), utcMidnight(endYmd), true).map(toYmd)
}

export function describeRecurrence(run: RecurrenceRun): string | null {
  if (!run.rrule) return null // weekly default — no label (would be noise on ~19 runs)
  return buildRule(run.rrule, run.dtstart ?? '2020-01-01').toText()
}
