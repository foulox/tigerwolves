import { currentUser } from '@clerk/nextjs/server'
import { getRunById, fetchSchedule, fetchWorkoutVariants, getLeaderRun, getFollowedRunIds } from '@/lib/db'
import { resolveWorkoutVariant } from '@/lib/scheduleUtils'
import Header from '@/components/Header'
import ScheduleClient from '@/components/ScheduleClient'
import RunFollowToggle from '@/components/RunFollowToggle'
import { getVoteData, workoutVoteId } from '@/lib/votes'

// Run-scoped schedule page (#329). Readable by anyone — logged-out visitors,
// runners, and non-owning leaders all see it read-only. Only the owning leader
// (the run returned by getLeaderRun matches this run's id) sees the edit
// affordances ("Plan week →" / "Edit in library →"), gated via isLeader below.
// Signed-in visitors also get a join/leave toggle (#330). Nav to reach this
// page comes later (R4 #332).
export default async function PerRunPage({ params }: { params: Promise<{ id: string }> }) {
  // Next 16: params is a Promise and must be awaited before use.
  const { id } = await params
  const runConfig = await getRunById(id)

  if (!runConfig) {
    return (
      <div>
        <Header title="Run not found" isLeader={false} />
        <p className="px-4 text-gray-500">We couldn&apos;t find that run.</p>
      </div>
    )
  }

  // Ownership: only leaders can own a run, and only of the one run getLeaderRun
  // resolves them to. Everyone else (runner, non-owning leader, logged out) is
  // read-only.
  const user = await currentUser()
  let isOwningLeader = false
  let isFollowing = false
  if (user) {
    if (user.publicMetadata?.role === 'leader') {
      const leaderRun = await getLeaderRun(user.id)
      isOwningLeader = leaderRun?.id === id
    }
    const followed = await getFollowedRunIds(user.id)
    isFollowing = followed.includes(id)
  }

  // Scope variants to THIS run's group (+ global families), not fetchData() — which
  // defaults to the tigerwolves group and silently drops any other run's owned
  // workouts (e.g. MMER's Easy family), leaving their cards stuck on "Not planned
  // yet". Mirrors assembleMyWeek's per-run resolution.
  const workoutVariants = await fetchWorkoutVariants(id)
  const schedule = await fetchSchedule(id)
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

  const subtitleParts = [runConfig.dayOfWeek, runConfig.meetingTime].filter(Boolean)

  return (
    <div>
      <Header
        title={`${runConfig.emoji ? `${runConfig.emoji} ` : ''}${runConfig.name}`}
        subtitle={subtitleParts.join(' · ')}
        isLeader={isOwningLeader}
      />

      {user && (
        <div className="px-4 -mt-1 mb-3">
          <RunFollowToggle runId={id} runName={runConfig.name} initialFollowing={isFollowing} />
        </div>
      )}

      {runConfig.description && (
        <p className="px-4 -mt-2 mb-3 text-sm text-gray-500">{runConfig.description}</p>
      )}

      <ScheduleClient
        past={past}
        pastWorkouts={pastWorkouts}
        upcoming={upcoming}
        upcomingWorkouts={upcomingWorkouts}
        isLeader={isOwningLeader}
        kind={runConfig.kind}
        voteData={voteData}
      />
    </div>
  )
}
