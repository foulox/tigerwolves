import type { Workout } from './data'

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
