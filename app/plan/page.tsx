import { currentUser } from '@clerk/nextjs/server'
import { fetchData, fetchSchedule, getLeaderRun, getRunRoster, generateScheduleHorizon } from '@/lib/db'
import PlanClient from '@/components/PlanClient'
import { getVoteData, workoutVoteId } from '@/lib/votes'
import type { RunConfig } from '@/lib/data'

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const user = await currentUser()
  const isLeader = user?.publicMetadata?.role === 'leader'

  // Identify this leader's run (falls back to TigerWolves config if not found)
  const tigerWolvesConfig: RunConfig = {
    id: 'tigerwolves', name: 'TigerWolves', emoji: '🐯🐺', dayOfWeek: 'Tuesday',
    postHeader: '🐯🐺 TigerWolves Tuesday Workout',
    meetingLocation: 'Starting point and route: Tom Stofka Garden, aka "Da Bins."\nWe\'ll warm up by jogging to Marsha P. Johnson which is at the corner of North 8th and Kent\nThe run will be along the Kent Avenue Speedway\nWe\'ll finish up back at Marsha P. Johnson State Park and cool down with a jog to the track',
    leaderIntro: 'Run Leaders:',
    closingNotes: 'Bag Drop: Sorry, Not available',
  }
  const runConfig = (user && isLeader ? await getLeaderRun(user.id) : null) ?? tigerWolvesConfig
  const runLeaders = isLeader ? await getRunRoster(runConfig.id) : []
  const roster = runLeaders
    .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999))
    .map(l => l.name)

  // Auto-generate schedule horizon (idempotent, runs outside cache)
  if (isLeader) {
    await generateScheduleHorizon(runConfig.id, runConfig.dayOfWeek, runLeaders)
  }

  // Schedule filtered to this leader's run; workout variants still come from the cached
  // aggregate since they're global/run-group-scoped and benefit from the 5-min cache.
  const [schedule, { workoutVariants }] = await Promise.all([
    fetchSchedule(runConfig.id),
    fetchData(),
  ])
  const today = new Date().toISOString().slice(0, 10)

  const upcoming = schedule
    .filter(e => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))

  const { week } = await searchParams
  const initialWeekIndex = Math.min(Math.max(parseInt(week ?? '0', 10) || 0, 0), upcoming.length - 1)

  const voteData = await getVoteData(workoutVariants.map(w => workoutVoteId(w.name, w.label ?? '')))

  return <PlanClient
    upcoming={upcoming}
    variants={workoutVariants}
    initialWeekIndex={initialWeekIndex}
    isLeader={isLeader}
    voteData={voteData}
    runConfig={runConfig}
    roster={roster}
    runLeaders={runLeaders}
  />
}
