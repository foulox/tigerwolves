import { unstable_cache } from 'next/cache'
import { fetchWorkouts, fetchSchedule, fetchRaces } from './db'

export const fetchData = unstable_cache(
  async () => {
    try {
      const [schedule, races, workouts] = await Promise.all([
        fetchSchedule(),
        fetchRaces(),
        fetchWorkouts(),
      ])
      return { schedule, races, workouts }
    } catch {
      return { schedule: [], races: [], workouts: [] }
    }
  },
  ['fetchData'],
  { revalidate: 300, tags: ['tigerwolves-data'] },
)
