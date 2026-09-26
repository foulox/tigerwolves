import { currentUser } from '@clerk/nextjs/server'
import { getRunById, fetchSchedule, fetchWorkoutVariants, getLeaderRun, getFollowedRunIds } from '@/lib/db'
import { resolveWorkoutVariant } from '@/lib/scheduleUtils'
import Header from '@/components/Header'
import GroupRunClient from '@/components/GroupRunClient'
import RunFollowToggle from '@/components/RunFollowToggle'
import { getVoteData, workoutVoteId } from '@/lib/votes'

// Group Run page (#329). Readable by anyone — logged-out visitors,
// runners, and non-owning leaders all see it read-only. Only the owning leader
// (the run returned by getLeaderRun matches this run's id) sees the edit
// affordances ("Edit schedule →" / "Edit in library →"), gated via isLeader below.
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

  // Draft runs are only visible to the owning leader or admins.
  const isAdmin = user?.publicMetadata?.admin === true
  if (runConfig.status === 'draft' && !isOwningLeader && !isAdmin) {
    return (
      <div>
        <Header title="Run not found" isLeader={false} />
        <p className="px-4 text-gray-500">We couldn&apos;t find that run.</p>
      </div>
    )
  }

  // As of #347, fetchWorkoutVariants(id) returns the full shared catalog — no
  // run_group_id scoping. Per-run resolution happens by matching the run's schedule
  // entries against that catalog. The runId arg is kept for callers (now informational).
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
          <RunFollowToggle
            runId={id}
            runName={runConfig.name}
            initialFollowing={isFollowing}
            joinable={runConfig.status !== 'draft' || isOwningLeader || isAdmin}
          />
        </div>
      )}

      {runConfig.description && (
        <p className="px-4 -mt-2 mb-3 text-sm text-gray-500">{runConfig.description}</p>
      )}

      <GroupRunClient
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
