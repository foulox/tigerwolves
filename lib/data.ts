export type WorkoutType = string

export type Workout = {
  name: string
  sport: string
  category: string
  type: WorkoutType
  reason: string
  instructions: string
  distTime: string
  lapStructure: string
  energySystem: string
  hrZone: string
  rpe: string
  lastRan: string | null
  coachingNotes: string | null
  mapLink: string | null
  variation: string       // specific variation description (e.g. "2x(5-4-3-2-1 min) 1min easy rec"); blank = standalone
  progression: number | null  // difficulty order 1-N within the family; null = standalone
}

export type ScheduleEntry = {
  date: string
  weekOfMonth: number
  workoutType: WorkoutType
  leader: string
  workoutName: string | null
}

export type Race = {
  date: string
  name: string
  distance: string
  location: string
}

export const CURRENT_LEADER = 'Lou'

export const TW_WORKOUT_TYPES: WorkoutType[] = [
  'Hills', 'Broken Tempo', 'Progression', 'Ladder', 'Superset', 'Straight Tempo', 'Threshold',
]

export function weekOfMonth(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00')
  return Math.ceil(d.getDate() / 7)
}
