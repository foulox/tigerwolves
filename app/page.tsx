import { auth } from '@clerk/nextjs/server'
import { fetchData } from '@/lib/db'
import { resolveWorkout } from '@/lib/scheduleUtils'
import FeedbackButton from '@/components/FeedbackButton'
import HeaderAuth from '@/components/HeaderAuth'
import TourWrapper from '@/components/TourWrapper'
import ScheduleCard from '@/components/ScheduleCard'
import { getVoteData, workoutVoteId } from '@/lib/votes'

export default async function SchedulePage() {
  const { userId } = await auth()
  const { schedule, workouts } = await fetchData()
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = schedule
    .filter(e => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))

  const resolvedWorkouts = upcoming.map(entry =>
    resolveWorkout(workouts, entry.workoutName, entry.selectedVariations)
  )
  const workoutIds = resolvedWorkouts
    .filter(w => w !== null)
    .map(w => workoutVoteId(w!.name, w!.variation))
  const voteData = await getVoteData(workoutIds)

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
        {upcoming.map((entry, i) => {
          const workout = resolvedWorkouts[i]
          return (
            <ScheduleCard
              key={`${entry.date}-${entry.workoutName ?? ''}`}
              entry={entry}
              workout={workout}
              index={i}
              isLeader={!!userId}
              voteData={workout ? (voteData[workoutVoteId(workout.name, workout.variation)] ?? null) : null}
            />
          )
        })}
      </div>
    </div>
  )
}
