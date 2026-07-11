import { auth } from '@clerk/nextjs/server'
import { fetchData } from '@/lib/db'
import { resolveWorkout } from '@/lib/scheduleUtils'
import FeedbackButton from '@/components/FeedbackButton'
import HeaderAuth from '@/components/HeaderAuth'
import TourWrapper from '@/components/TourWrapper'
import ScheduleCard from '@/components/ScheduleCard'

export default async function SchedulePage() {
  const { userId } = await auth()
  const { schedule, workouts } = await fetchData()
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = schedule.filter(e => e.date >= today)

  return (
    <div>
      <header className="px-4 pt-10 pb-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>
          <p className="text-sm text-gray-500 mt-0.5">Upcoming Tuesdays</p>
        </div>
        <div className="flex items-center gap-3">
          <TourWrapper isLeader={!!userId} />
          <HeaderAuth isLeader={!!userId} />
          <FeedbackButton />
        </div>
      </header>

      <div className="px-4 flex flex-col gap-3">
        {upcoming.length === 0 && (
          <p className="text-gray-400 italic text-sm">No upcoming workouts scheduled yet.</p>
        )}
        {upcoming.map((entry, i) => (
          <ScheduleCard
            key={entry.date}
            entry={entry}
            workout={resolveWorkout(workouts, entry.workoutName, entry.selectedVariations)}
            index={i}
          />
        ))}
      </div>
    </div>
  )
}
