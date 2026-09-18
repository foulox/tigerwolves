import type { WorkoutVariantRow } from './data'

// #405: the Schedule "change workout" picker's candidate pool + filter options.
//
// "Your run" mode is unchanged from #401/#404: the pool is the run's LIBRARY
// (ownVariants — routes it created OR adopted), narrowed to the week's workout
// type(s) for a Workout run, or the run's category for a non-Workout run.
//
// "All runs" mode is the one-time cross-run borrow escape hatch: it drops EVERY
// run-scope and type restriction — it offers every run's workouts of every type,
// narrowed only by the optional browse category/type pills. Selecting one and
// saving writes a schedule row only (see setPlanWorkout) — no run_workouts
// membership, so the borrow never joins the library or rotation.

// The base set both the search box and the suggestion list draw from. "All runs"
// widens it from the run's library to the full shared catalog (AC3).
export function schedulePickerScope(
  showAllRuns: boolean,
  ownVariants: WorkoutVariantRow[],
  allVariants: WorkoutVariantRow[],
): WorkoutVariantRow[] {
  return showAllRuns ? allVariants : ownVariants
}

// The default (no-search) suggestion list, ordered least-recently-used first and
// with the already-planned workout excluded (it's shown separately as "Currently
// planned"). The scope/filter differs by mode; the exclusion + ordering do not.
export function schedulePickerSuggestions(a: {
  showAllRuns: boolean
  ownVariants: WorkoutVariantRow[]
  allVariants: WorkoutVariantRow[]
  isWorkout: boolean
  runCategory: string | null
  weekTypes: string[]
  browseCategory: string | null
  browseType: string | null
  plannedId: number | null
}): WorkoutVariantRow[] {
  const pool = a.showAllRuns
    ? a.allVariants
        .filter(w => !a.browseCategory || w.category === a.browseCategory)
        .filter(w => !a.browseType || w.type === a.browseType)
    : a.isWorkout
      ? a.ownVariants.filter(w => a.weekTypes.includes(w.type))
      : a.ownVariants.filter(w => !a.runCategory || w.category === a.runCategory)

  return pool
    .filter(w => a.plannedId == null || w.id !== a.plannedId)
    .sort((x, y) => ((x.lastRan ?? '0') < (y.lastRan ?? '0') ? -1 : 1))
}

// "All runs" category pills — every category present across ALL runs' workouts
// (not the run's own). Used only in "All runs" mode.
export function allRunsCategories(variants: WorkoutVariantRow[]): string[] {
  return Array.from(new Set(variants.map(w => w.category).filter(Boolean))).sort()
}

// "All runs" type pills — every type present across all runs, optionally narrowed
// to the selected category. Never the run's allowlist or the week's nominal type.
export function allRunsTypes(variants: WorkoutVariantRow[], category: string | null): string[] {
  const pool = category ? variants.filter(w => w.category === category) : variants
  return Array.from(new Set(pool.map(w => w.type).filter(Boolean))).sort()
}
