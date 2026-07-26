import { auth } from '@clerk/nextjs/server'
import { fetchData } from '@/lib/db'
import { resolveWorkout } from '@/lib/scheduleUtils'
import FeedbackButton from '@/components/FeedbackButton'
import HeaderAuth from '@/components/HeaderAuth'
import HowToUseButton from '@/components/HowToUseButton'
import WhatsNewOverlay from '@/components/WhatsNewOverlay'
import ScheduleClient from '@/components/ScheduleClient'
import { getVoteData, workoutVoteId } from '@/lib/votes'

export default async function SchedulePage() {
  const { userId } = await auth()
  const { schedule, workouts } = await fetchData()
  const today = new Date().toISOString().slice(0, 10)

  const PAST_WEEKS_SHOWN = 8

  const upcoming = schedule
    .filter(e => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
  const allPast = schedule
    .filter(e => e.date < today)
    .sort((a, b) => a.date.localeCompare(b.date))
  // Bounded to a fixed window — no "load more" — so resolveWorkout/vote-data cost
  // stays flat regardless of how much schedule history accumulates over time.
  const past = allPast.slice(Math.max(0, allPast.length - PAST_WEEKS_SHOWN))

  const upcomingWorkouts = upcoming.map(entry =>
    resolveWorkout(workouts, entry.workoutName, entry.selectedVariations)
  )
  const pastWorkouts = past.map(entry =>
    resolveWorkout(workouts, entry.workoutName, entry.selectedVariations)
  )

  const workoutIds = [...upcomingWorkouts, ...pastWorkouts]
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
          <WhatsNewOverlay />
          <HowToUseButton />
          <HeaderAuth isLeader={!!userId} />
          <FeedbackButton />
        </div>
      </header>

      <ScheduleClient
        past={past}
        pastWorkouts={pastWorkouts}
        upcoming={upcoming}
        upcomingWorkouts={upcomingWorkouts}
        isLeader={!!userId}
        voteData={voteData}
      />
    </div>
  )
}
