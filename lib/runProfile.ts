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

// Only the `Workout` kind emits a structured WORKOUT section in the post and
// exposes a workout-type filter/picker (#322). Every other kind is a plain run.
export function isWorkoutKind(kind: string): boolean {
  return kind === 'Workout'
}

// Resolve the workout types a run should surface (#322): the run's allowlist
// intersected with the types actually present in its library, deduped and sorted.
// An empty allowlist means "no profile configured" — fall back to every present
// type so the behavior matches the pre-allowlist app.
export function resolveAllowedTypes(presentTypes: string[], allowlist: string[]): string[] {
  const present = Array.from(new Set(presentTypes))
  const resolved = allowlist.length === 0 ? present : present.filter(t => allowlist.includes(t))
  return resolved.sort()
}
