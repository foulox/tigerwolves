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
  flagged: boolean
  flagNote: string
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
  selectedVariations: string[]
}

export type Race = {
  id: number
  date: string
  name: string
  distance: string
  location: string
  organizer: string
  verified: boolean
  flagged: boolean
  flagNote: string
}

export type RunGroup = {
  id: number
  name: string
  venue: string  // 'road' | 'track' | 'trail'
  defaultLocation: string | null
}

export const RUN_LEADERS = ['Luis', 'Lou', 'Kostas', 'Joelle', 'Kelsey', 'Obi', 'Jared']

export const TW_WORKOUT_TYPES: WorkoutType[] = [
  'Hills', 'Broken Tempo', 'Progression', 'Ladder', 'Superset', 'Straight Tempo', 'Threshold',
]

export function weekOfMonth(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00')
  return Math.ceil(d.getDate() / 7)
}

// Rejects both malformed strings and rollover dates (e.g. "2026-02-30" parses
// as March 2 in JS, which this catches by checking the parsed components
// still match the input rather than just checking isNaN).
export function isValidDateString(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}
