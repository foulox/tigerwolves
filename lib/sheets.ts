import { unstable_cache } from 'next/cache'
import type { Workout, ScheduleEntry, Race } from './data'
import { weekOfMonth } from './data'
import { fetchWorkouts, fetchSchedule, fetchRaces } from './db'

type RawRow = Record<string, unknown>

function str(val: unknown): string {
  if (val === null || val === undefined || val === '[URL]') return ''
  return String(val).trim()
}

function normalizeDate(val: unknown): string | null {
  const s = str(val)
  return s.length >= 10 ? s.slice(0, 10) : null
}

export function mapWorkout(row: RawRow): Workout {
  return {
    name: str(row['Workout Name']),
    sport: str(row['Sport']),
    category: str(row['Category']),
    type: str(row['Type']),
    reason: str(row['Reason / Purpose']),
    instructions: str(row['Instructions']),
    distTime: str(row['Dist/Time']),
    lapStructure: str(row['Lap Structure']),
    energySystem: str(row['Energy System']),
    hrZone: str(row['HR Zone']),
    rpe: str(row['RPE']),
    lastRan: normalizeDate(row['Last Ran']),
    coachingNotes: str(row['Coaching Notes']) || null,
    mapLink: str(row['Map Link']) || null,
    variation: str(row['Variation']),
    progression: (() => { const n = parseInt(str(row['Progression'])); return isNaN(n) ? null : n })(),
    author: str(row['Author']) || null,
    raceTypes: str(row['Race Type']).split(',').map(s => s.trim()).filter(Boolean),
    trainingPhases: str(row['Training Phase']).split(',').map(s => s.trim()).filter(Boolean),
    hasTurnaround: str(row['hasTurnaround']) === 'TRUE',
    turnaroundDistance: str(row['turnaroundDistance']),
  }
}

export function mapScheduleEntry(row: RawRow): ScheduleEntry {
  const date = normalizeDate(row['Date']) ?? ''
  return {
    date,
    weekOfMonth: date ? weekOfMonth(date) : 0,
    workoutType: str(row['Workout Type']),
    leader: str(row['Leader']),
    workoutName: str(row['Workout Name']) || null,
  }
}

export function mapRace(row: RawRow): Race {
  return {
    date: normalizeDate(row['Date']) ?? '',
    name: str(row['Name']),
    distance: str(row['Distance']),
    location: str(row['Location']),
  }
}

export const fetchData = unstable_cache(
  async () => {
    const [schedule, races, workouts] = await Promise.all([
      fetchSchedule(),
      fetchRaces(),
      fetchWorkouts(),
    ])
    return { schedule, races, workouts }
  },
  ['fetchData'],
  { revalidate: 300 },
)
