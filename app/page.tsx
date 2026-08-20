import { auth } from '@clerk/nextjs/server'
import { fetchData } from '@/lib/db'
import { resolveWorkoutVariant } from '@/lib/scheduleUtils'
import Header from '@/components/Header'
import ScheduleClient from '@/components/ScheduleClient'
import { getVoteData, workoutVoteId } from '@/lib/votes'

export default async function SchedulePage() {
  const { userId } = await auth()
  const { schedule, workoutVariants } = await fetchData()
  const today = new Date().toISOString().slice(0, 10)

  const PAST_WEEKS_SHOWN = 8

  const upcoming = schedule
    .filter(e => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
  const allPast = schedule
    .filter(e => e.date < today)
    .sort((a, b) => a.date.localeCompare(b.date))
  // Bounded to a fixed window — no "load more" — so resolveWorkoutVariant/vote-data
  // cost stays flat regardless of how much schedule history accumulates over time.
  const past = allPast.slice(Math.max(0, allPast.length - PAST_WEEKS_SHOWN))

  const upcomingWorkouts = upcoming.map(entry =>
    resolveWorkoutVariant(workoutVariants, entry.workoutName, entry.selectedVariations)
  )
  const pastWorkouts = past.map(entry =>
    resolveWorkoutVariant(workoutVariants, entry.workoutName, entry.selectedVariations)
  )

  const workoutIds = [...upcomingWorkouts, ...pastWorkouts]
    .filter(w => w !== null)
    .map(w => workoutVoteId(w!.name, w!.label ?? ''))
  const voteData = await getVoteData(workoutIds)

  return (
    <div>
      <Header title="Schedule" subtitle="Upcoming Tuesdays" isLeader={!!userId} />

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
