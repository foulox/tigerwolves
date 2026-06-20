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
  author: string | null       // credit — individual name or "TigerWolves"
  raceTypes: string[]         // e.g. ['Half', 'Full']
  trainingPhases: string[]    // e.g. ['Build', 'Peak']
  hasTurnaround: boolean
  turnaroundDistance: string
}

export const RACE_TYPES = ['Mile', '5K', '10K', 'Half', 'Full'] as const
export const TRAINING_PHASES = ['Base', 'Build', 'Peak', 'Taper'] as const

export const ABBREVIATIONS: { abbr: string; meaning: string }[] = [
  { abbr: 'WU', meaning: 'Warm-up' },
  { abbr: 'CD', meaning: 'Cool-down' },
  { abbr: 'r', meaning: 'Recovery' },
  { abbr: '@', meaning: 'At pace' },
  { abbr: 'MP', meaning: 'Marathon Pace' },
  { abbr: 'HMP', meaning: 'Half Marathon Pace' },
  { abbr: '10M', meaning: '10-Mile Pace' },
  { abbr: '10K / 5K', meaning: 'Race pace at that distance' },
  { abbr: 'LT', meaning: 'Lactate Threshold' },
  { abbr: 'Z1–Z5', meaning: 'Heart Rate Zones 1–5' },
  { abbr: 'RPE', meaning: 'Rate of Perceived Exertion (1–10)' },
  { abbr: '×', meaning: 'Repeats / sets' },
  { abbr: 's / min', meaning: 'Seconds / minutes' },
]

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

export const RUN_LEADERS = ['Luis', 'Lou', 'Kostas', 'Matthew', 'Joelle', 'Kelsey', 'Obi', 'Jared']

export const TW_WORKOUT_TYPES: WorkoutType[] = [
  'Hills', 'Broken Tempo', 'Progression', 'Ladder', 'Superset', 'Straight Tempo', 'Threshold',
]

export function weekOfMonth(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00')
  return Math.ceil(d.getDate() / 7)
}
