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

// Map a run's `kind` to the workout-library `category` used for shared-catalog
// client-side scoping (#347). `Beginner-Friendly` and `Easy` both map to `'Easy'`;
// `Food` has no library category.
const KIND_TO_CATEGORY_MAP: Record<string, string | null> = {
  'Workout': 'Quality',
  'Easy': 'Easy',
  'Long': 'Long',
  'Beginner-Friendly': 'Easy',
  'Food': null,
}

export function kindToCategory(kind: string): string | null {
  return KIND_TO_CATEGORY_MAP[kind] ?? null
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

// Returns true when a workout from the shared library is adoptable by a given run.
// Workout runs gate by category (must be 'Quality') and optionally by type allowlist.
// Non-Workout runs gate by category match via kindToCategory.
export function isRouteAdoptable(
  workout: { category: string; type: string },
  run: { kind: string; workoutTypes: string[] },
): boolean {
  if (run.kind === 'Workout') {
    // Empty allowlist means "any type" — mirrors resolveAllowedTypes' no-profile fallback.
    return workout.category === 'Quality' && (run.workoutTypes.length === 0 || run.workoutTypes.includes(workout.type))
  }
  const cat = kindToCategory(run.kind)
  return cat != null && workout.category === cat
}

// #360: NBR directory category maps. KIND_TO_NBR_CATEGORY maps a run's `kind`
// (DB column) to the NBRRun.category value used by the All Runs directory.
// This is distinct from kindToCategory() above which maps to workout-library categories.
export type NBRCategory = 'Beginner-Friendly' | 'Easy Runs' | 'Long Runs' | 'Food Runs' | 'Workouts'

export const KIND_TO_NBR_CATEGORY: Record<string, NBRCategory> = {
  'Beginner-Friendly': 'Beginner-Friendly',
  'Easy': 'Easy Runs',
  'Long': 'Long Runs',
  'Food': 'Food Runs',
  'Workout': 'Workouts',
}

export const NBR_CATEGORY_TO_KIND: Record<NBRCategory, string> = {
  'Beginner-Friendly': 'Beginner-Friendly',
  'Easy Runs': 'Easy',
  'Long Runs': 'Long',
  'Food Runs': 'Food',
  'Workouts': 'Workout',
}

// #360: day-name ↔ abbreviation maps. day_of_week in the DB uses full names
// ('Monday', 'Tuesday', …); NBRRun.day uses 3-letter abbreviations ('mon', 'tue', …).
export type DayAbbrev = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export const DAY_FULL_TO_ABBREV: Record<string, DayAbbrev> = {
  'Monday': 'mon',
  'Tuesday': 'tue',
  'Wednesday': 'wed',
  'Thursday': 'thu',
  'Friday': 'fri',
  'Saturday': 'sat',
  'Sunday': 'sun',
}

export const DAY_ABBREV_TO_FULL: Record<DayAbbrev, string> = {
  'mon': 'Monday',
  'tue': 'Tuesday',
  'wed': 'Wednesday',
  'thu': 'Thursday',
  'fri': 'Friday',
  'sat': 'Saturday',
  'sun': 'Sunday',
}

// #360: Parse a display time string into a 24h float for sort/filter.
// Handles the space-before-meridiem, uppercase forms the DB uses ('6:30 AM')
// and the lowercase no-space forms the NBR static data uses ('6:30am', '7pm').
// Unparseable / null / empty → 99 so such cards sort last.
export function parseStartHour(displayTime: string | null | undefined): number {
  if (!displayTime) return 99
  const m = displayTime.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i)
  if (!m) return 99
  let hours = parseInt(m[1], 10)
  const minutes = m[2] ? parseInt(m[2], 10) : 0
  const meridiem = m[3].toLowerCase()
  if (meridiem === 'pm' && hours !== 12) hours += 12
  if (meridiem === 'am' && hours === 12) hours = 0
  return hours + minutes / 60
}
