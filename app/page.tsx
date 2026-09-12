import { currentUser } from '@clerk/nextjs/server'
import { fetchData, fetchSchedule, getLeaderRun, getRunRoster, generateScheduleHorizon } from '@/lib/db'
import { resolveWorkoutVariant } from '@/lib/scheduleUtils'
import Header from '@/components/Header'
import ScheduleClient from '@/components/ScheduleClient'
import { getVoteData, workoutVoteId } from '@/lib/votes'
import type { RunConfig } from '@/lib/data'

export default async function SchedulePage() {
  const user = await currentUser()
  const isLeader = user?.publicMetadata?.role === 'leader'

  // Identify this leader's run (falls back to TigerWolves config if not found)
  const tigerWolvesConfig: RunConfig = {
    id: 'tigerwolves', name: 'TigerWolves', emoji: '🐯🐺', dayOfWeek: 'Tuesday',
    postHeader: '🐯🐺 TigerWolves Tuesday Workout',
    meetingLocation: 'Starting point and route: Tom Stofka Garden, aka "Da Bins."\nWe\'ll warm up by jogging to Marsha P. Johnson which is at the corner of North 8th and Kent\nThe run will be along the Kent Avenue Speedway\nWe\'ll finish up back at Marsha P. Johnson State Park and cool down with a jog to the track',
    leaderIntro: 'Run Leaders:',
    closingNotes: 'Bag Drop: Sorry, Not available',
    kind: 'Workout',
    workoutTypes: ['Hills', 'Broken Tempo', 'Progression', 'Ladder', 'Superset', 'Straight Tempo', 'Threshold'],
    // Fallback only serves anonymous/non-leader views (no workout scoping); the real
    // run_group_id comes from getLeaderRun for signed-in leaders.
    runGroupId: null,
  }
  const runConfig = (user && isLeader ? await getLeaderRun(user.id) : null) ?? tigerWolvesConfig
  const runLeaders = isLeader ? await getRunRoster(runConfig.id) : []
  if (isLeader) await generateScheduleHorizon(runConfig.id, runConfig.dayOfWeek, runLeaders)

  const { workoutVariants } = await fetchData()
  const schedule = await fetchSchedule(runConfig.id)
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
      <Header title="Schedule" subtitle={`Upcoming ${runConfig.dayOfWeek}s`} isLeader={isLeader} />

      <ScheduleClient
        past={past}
        pastWorkouts={pastWorkouts}
        upcoming={upcoming}
        upcomingWorkouts={upcomingWorkouts}
        isLeader={isLeader}
        voteData={voteData}
      />
    </div>
  )
}
