// Per-run workout-type cycle (#319).
//
// A run defines its workout-type cadence once in config (cycle_mode + cycle),
// and generateScheduleHorizon fills each newly generated week's workout_type
// from it. resolveWorkoutType is the pure resolver — no DB, no side effects —
// so it can be unit-tested and reused wherever a date needs its cycle default.
//
// cycle_mode:
//   'none'          — no cadence; every generated week gets workout_type ''.
//   'week_of_month' — cycle is a slot→type map keyed by week-of-month
//                     ("1".."5"); a date resolves to cycle[weekOfMonth(date)].
//
// The "sequential loop" variant was dropped (YAGNI); only these two exist.

import { weekOfMonth } from './data'

export type CycleMode = 'none' | 'week_of_month'

export function resolveWorkoutType(
  mode: string | null,
  cycle: Record<string, string> | null,
  dateStr: string,
): string {
  if (mode === 'week_of_month') {
    return cycle?.[String(weekOfMonth(dateStr))] ?? ''
  }
  return ''
}
