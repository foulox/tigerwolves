import type { Workout, WorkoutVariantRow } from './data'

export function resolveWorkout(
  workouts: Workout[],
  workoutName: string | null,
  selectedVariations: string[] = [],
): Workout | null {
  if (!workoutName) return null
  // 1. Base row (variation = '' — standalone or family base)
  const base = workouts.find(w => w.name === workoutName && w.variation === '')
  if (base) return base
  // 2. The specific variation the leader selected for this week
  const picked = selectedVariations.find(v => v !== '')
  if (picked) {
    const match = workouts.find(w => w.name === workoutName && w.variation === picked)
    if (match) return match
    // Selected variation no longer exists in the library (renamed or deleted)
    console.error(`[resolveWorkout] Selected variation "${picked}" not found for workout "${workoutName}" — falling back to first progression member`)
  }
  // 3. First progression member (lowest progression number; nulls sort last)
  const family = workouts
    .filter(w => w.name === workoutName)
    .sort((a, b) => (a.progression ?? Infinity) - (b.progression ?? Infinity))
  return family[0] ?? null
}

// Same algorithm as resolveWorkout, against workout_variants read data (#276).
// PlanClient-only for now — the Schedule screen (app/page.tsx) still resolves
// against the legacy `workouts` table via resolveWorkout above, since its
// flagging UI (WorkoutFlagSheet/dbFlagWorkout) writes to that table by
// (name, variation) and isn't moving to variant_id until #277. schedule.workout_name/
// selected_variations are still plain strings (unchanged until #277), matched here
// against family.name/variant.label rather than variant_id.
export function resolveWorkoutVariant(
  variants: WorkoutVariantRow[],
  workoutName: string | null,
  selectedVariations: string[] = [],
): WorkoutVariantRow | null {
  if (!workoutName) return null
  // 1. Base row (label = null — standalone or family's sole/default variant)
  const base = variants.find(w => w.name === workoutName && w.label === null)
  if (base) return base
  // 2. The specific variation the leader selected for this week
  const picked = selectedVariations.find(v => v !== '')
  if (picked) {
    const match = variants.find(w => w.name === workoutName && w.label === picked)
    if (match) return match
    // Selected variation no longer exists in the library (renamed or deleted)
    console.error(`[resolveWorkoutVariant] Selected variation "${picked}" not found for workout "${workoutName}" — falling back to first sort-order member`)
  }
  // 3. First variant by sort order (nulls last)
  const family = variants
    .filter(w => w.name === workoutName)
    .sort((a, b) => (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity))
  return family[0] ?? null
}
