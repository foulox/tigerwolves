import type { Workout } from './data'

export function resolveWorkout(workouts: Workout[], workoutName: string | null): Workout | null {
  if (!workoutName) return null
  return workouts.find(w => w.name === workoutName && w.variation === '') ?? null
}
