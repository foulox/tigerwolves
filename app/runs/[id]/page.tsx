import { currentUser } from '@clerk/nextjs/server'
import { getRunById, fetchSchedule, fetchData, getLeaderRun, isUserFollowingRun } from '@/lib/db'
import { resolveWorkoutVariant } from '@/lib/scheduleUtils'
import Header from '@/components/Header'
import ScheduleClient from '@/components/ScheduleClient'
import { getVoteData, workoutVoteId } from '@/lib/votes'

export default async function PerRunPage({ params }: { params: { id: string } }) {
  const user = await currentUser()
  const runConfig = await getRunById(params.id)

  if (!runConfig) {
    return (
      <div className="p-4 text-center">
        <p className="text-gray-500">Run not found</p>
      </div>
    )
  }

  // Determine if the signed-in user owns this run (and is therefore the owning leader).
  // Only leaders can own runs; determine ownership by checking if their run (from getLeaderRun)
  // matches this run's ID.
  let isOwningLeader = false
  if (user && user.publicMetadata?.role === 'leader') {
    const leaderRun = await getLeaderRun(user.id)
    isOwningLeader = leaderRun?.id === params.id
  }

  // Check if the user is following this run
  let isFollowing = false
  if (user) {
    isFollowing = await isUserFollowingRun(user.id, params.id)
  }

  const { workoutVariants } = await fetchData()
  const schedule = await fetchSchedule(params.id)
  const today = new Date().toISOString().slice(0, 10)

  const PAST_WEEKS_SHOWN = 8

  const upcoming = schedule
    .filter(e => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
  const allPast = schedule
    .filter(e => e.date < today)
    .sort((a, b) => a.date.localeCompare(b.date))
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
      <Header
        title={runConfig.name}
        subtitle={`${runConfig.dayOfWeek} • ${runConfig.emoji || ''}`}
        isLeader={isOwningLeader}
        runId={params.id}
        isLoggedIn={!!user}
        isFollowing={isFollowing}
      />

      <ScheduleClient
        past={past}
        pastWorkouts={pastWorkouts}
        upcoming={upcoming}
        upcomingWorkouts={upcomingWorkouts}
        isLeader={isOwningLeader}
        canEditRun={isOwningLeader}
        voteData={voteData}
      />
    </div>
  )
}
