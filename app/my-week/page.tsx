import { fetchData } from '@/lib/sheets'
import { CURRENT_LEADER } from '@/lib/data'
import MyWeekClient from '@/components/MyWeekClient'

export default async function MyWeekPage() {
  const { schedule, workouts } = await fetchData()
  const today = new Date().toISOString().slice(0, 10)

  const myEntry = schedule.find(e => e.leader === CURRENT_LEADER && e.date >= today)

  if (!myEntry) {
    return (
      <div className="px-4 pt-10">
        <h1 className="text-2xl font-bold text-gray-900">My Week</h1>
        <p className="text-gray-500 mt-4">No upcoming weeks assigned to you.</p>
      </div>
    )
  }

  const suggestions = workouts
    .filter(w => w.type === myEntry.workoutType)
    .sort((a, b) => (a.lastRan ?? '0') < (b.lastRan ?? '0') ? -1 : 1)
    .slice(0, 3)

  return <MyWeekClient leader={CURRENT_LEADER} entry={myEntry} suggestions={suggestions} />
}
