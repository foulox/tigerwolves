import type { RunConfig, ScheduleEntry, WorkoutVariantRow } from './data'

// #331 My Week — pure helpers shared by the server page, MyWeekClient, and
// ScheduleCard's kind-aware compact body. Deliberately dependency-free (types
// only) so it unit-tests without a DB, Clerk, or React in scope.

// One followed run's schedule entry, tagged with run identity, for the cross-run
// My Week feed. `workout` is the resolved variant (null when nothing is planned).
export type MyWeekItem = {
  run: RunConfig
  date: string
  entry: ScheduleEntry
  workout: WorkoutVariantRow | null
}

export type DayGroup = { date: string; label: string; items: MyWeekItem[] }

// Kind-aware compact fields. `shape` mirrors #322's read-side split: a Workout-kind
// run shows a type pill + a short prescription line; an Easy/route run shows a
// distance + a map link instead (no type pill).
export type CompactFields =
  | { shape: 'workout'; typePill: string; setLine: string | null }
  | { shape: 'route'; distance: string | null; routeLink: string | null }

// YYYY-MM-DD arithmetic done in UTC so it never drifts across the viewer's
// timezone (the rest of the app parses schedule dates as `${iso}T00:00:00`).
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

// Today / Tomorrow / full weekday name, relative to `today`.
export function dayLabel(date: string, today: string): string {
  if (date === today) return 'Today'
  if (date === addDays(today, 1)) return 'Tomorrow'
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  })
}

// The feed's visible date range for a given week offset. Offset 0 is the home
// view: a couple of past days through a rolling ~7 days forward. Any navigated
// week is a clean 7-day block (no past lead), so "forward/back one week" reads
// cleanly.
export function feedWindow(today: string, offsetWeeks: number): { start: string; end: string } {
  if (offsetWeeks === 0) {
    return { start: addDays(today, -2), end: addDays(today, 7) }
  }
  const weekStart = addDays(today, offsetWeeks * 7)
  return { start: weekStart, end: addDays(weekStart, 6) }
}

export type StripCell = { date: string; weekdayShort: string; dayNum: number; isToday: boolean }

// The 7 day cells for the date strip at a given week offset.
export function weekStripCells(today: string, offsetWeeks: number): StripCell[] {
  const start = addDays(today, offsetWeeks * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i)
    const [y, m, d] = date.split('-').map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d))
    return {
      date,
      weekdayShort: dt.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
      dayNum: d,
      isToday: date === today,
    }
  })
}

// Group tagged entries by day, ascending; multiple runs on one day share a group,
// ordered by run name so the interleave is stable.
export function groupByDay(items: MyWeekItem[], today: string): DayGroup[] {
  const sorted = [...items].sort(
    (a, b) => a.date.localeCompare(b.date) || a.run.name.localeCompare(b.run.name),
  )
  const byDate = new Map<string, MyWeekItem[]>()
  for (const it of sorted) {
    const bucket = byDate.get(it.date)
    if (bucket) bucket.push(it)
    else byDate.set(it.date, [it])
  }
  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, groupItems]) => ({ date, label: dayLabel(date, today), items: groupItems }))
}

// Collapse whitespace to one line; truncate with an ellipsis past `max`.
export function truncateSet(s: string, max = 60): string {
  const oneLine = s.replace(/\s+/g, ' ').trim()
  if (oneLine.length <= max) return oneLine
  return oneLine.slice(0, max - 1).trimEnd() + '…'
}

// Decide the compact body fields by the run's kind. Anything other than the
// 'Workout' kind renders as a route (distance + map link) — the read-side mirror
// of #322's post-shape-by-kind.
export function compactCardFields(
  runKind: string,
  entry: ScheduleEntry,
  workout: WorkoutVariantRow | null,
): CompactFields {
  if (runKind === 'Workout') {
    return {
      shape: 'workout',
      typePill: entry.workoutType,
      setLine: workout?.rawInput ? truncateSet(workout.rawInput) : null,
    }
  }
  return {
    shape: 'route',
    distance: workout?.distTime?.trim() || null,
    routeLink: workout?.mapLink?.trim() || null,
  }
}
