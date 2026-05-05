import type { Workout, ScheduleEntry, Race } from './data'
import { weekOfMonth } from './data'

type RawRow = Record<string, unknown>

function str(val: unknown): string {
  if (val === null || val === undefined || val === '[URL]') return ''
  return String(val).trim()
}

function normalizeDate(val: unknown): string | null {
  const s = str(val)
  return s.length >= 10 ? s.slice(0, 10) : null
}

function mapWorkout(row: RawRow): Workout {
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
  }
}

function mapScheduleEntry(row: RawRow): ScheduleEntry {
  const date = normalizeDate(row['Date']) ?? ''
  return {
    date,
    weekOfMonth: date ? weekOfMonth(date) : 0,
    workoutType: str(row['Workout Type']),
    leader: str(row['Leader']),
    workoutName: str(row['Workout Name']) || null,
  }
}

function mapRace(row: RawRow): Race {
  return {
    date: normalizeDate(row['Date']) ?? '',
    name: str(row['Name']),
    distance: str(row['Distance']),
    location: str(row['Location']),
  }
}

export async function fetchData() {
  try {
    const res = await fetch(process.env.SHEETS_URL!, { next: { revalidate: 300 } })
    const json = await res.json() as { schedule: RawRow[], races: RawRow[], workouts: RawRow[] }
    return {
      schedule: json.schedule.map(mapScheduleEntry).filter(e => e.date),
      races: json.races.map(mapRace).filter(r => r.date),
      workouts: json.workouts.map(mapWorkout).filter(w => w.name),
    }
  } catch {
    return { schedule: [], races: [], workouts: [] }
  }
}
