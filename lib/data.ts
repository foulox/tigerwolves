export type WorkoutType = string

// One workout_variant row joined with its parent workout_families row (#276),
// the read shape for the Library/Plan/Schedule screens — the write side
// (dbInsertWorkoutVariant/dbUpdateWorkoutVariant) targets these tables (#274).
// `sport`, `lapStructure`, and `lastRan` have no column on workout_families/
// workout_variants and are not carried over; lastRan-dependent UI (recency
// sort, "Last ran"/"Never" display) degrades to a no-op/always-"Never" until
// the app tracks this some other way.
export type WorkoutVariantRow = {
  id: number                  // workout_variants.id
  familyId: number
  name: string                 // workout_families.name
  label: string | null         // workout_variants.label — null = sole/standard variant
  sortOrder: number | null
  category: string
  type: WorkoutType
  reason: string
  rawInput: string
  distTime: string
  energySystem: string
  hrZone: string
  rpe: string
  coachingNotes: string | null
  mapLink: string | null
  author: string | null
  raceTypes: string[]
  trainingPhases: string[]
  hasTurnaround: boolean
  turnaround: string
  flagged: boolean
  flagNote: string
  runGroupId: number | null
  lastRan: string | null
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
