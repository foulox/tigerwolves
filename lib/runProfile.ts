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

// Per-run workout-type cycle slots (#323). `week_of_month` cadence assigns a type
// to each of the 1st–5th occurrences of the run's day within a month. A slot's
// stored value may be compound ("Ladder or Superset") — matching how workout_type
// is split on ' or ' throughout the Plan/post code — so parse/join here are the
// single split/join point shared by the editor (AboutRunTab) and the server action
// (saveRunCycle), keeping the storage format from drifting between the two.
export const WEEK_SLOTS = [1, 2, 3, 4, 5] as const

const SLOT_SEPARATOR = ' or '

/** Split a stored slot value into its component types (trimmed, no empties). */
export function parseSlotValue(v: string): string[] {
  return v
    .split(SLOT_SEPARATOR)
    .map(t => t.trim())
    .filter(Boolean)
}

/** Join selected types back into a stored slot value. */
export function joinSlotValue(types: string[]): string {
  return types.map(t => t.trim()).filter(Boolean).join(SLOT_SEPARATOR)
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
