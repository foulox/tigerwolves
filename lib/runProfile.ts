// Per-run profile vocabularies (#321). These two sets are the single source of
// truth for a run's `kind` and its workout-type allowlist. They're shared by the
// client editor (AboutRunTab) and the server action (saveRunProfile) so the valid
// values can't drift between what the UI offers and what the action accepts.
//
// RUN_KINDS mirror NBR's own schedule buckets (see lib/allRunsData.ts). Only the
// `Workout` kind exposes a workout-type allowlist.

export const RUN_KINDS = [
  'Beginner-Friendly',
  'Easy',
  'Long',
  'Food',
  'Workout',
] as const

export const WORKOUT_TYPE_OPTIONS = [
  'Hills',
  'Broken Tempo',
  'Progression',
  'Ladder',
  'Superset',
  'Straight Tempo',
  'Threshold',
  'Intervals',
] as const

export type RunKind = (typeof RUN_KINDS)[number]
export type WorkoutTypeOption = (typeof WORKOUT_TYPE_OPTIONS)[number]
