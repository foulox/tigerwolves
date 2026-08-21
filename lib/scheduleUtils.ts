import type { WorkoutVariantRow } from './data'

// Resolves a schedule entry's planned workout against workout_variants read
// data (#276). schedule.workout_name/selected_variations are plain strings, so
// matching happens against family.name/variant.label rather than variant_id.
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
