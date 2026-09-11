import { currentUser } from '@clerk/nextjs/server'
import { fetchWorkoutVariants, getLeaderRun } from '@/lib/db'
import LibraryClient from '@/components/LibraryClient'
import Header from '@/components/Header'
import { getVoteData, workoutVoteId } from '@/lib/votes'
import type { RunConfig } from '@/lib/data'

export default async function LibraryPage() {
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
  const workoutVariants = await fetchWorkoutVariants(isLeader ? runConfig.id : undefined)
  const voteData = await getVoteData(workoutVariants.map(w => workoutVoteId(w.name, w.label ?? '')))
  return (
    <div>
      <Header title="Library" isLeader={isLeader} />
      <LibraryClient variants={workoutVariants} isLeader={isLeader} voteData={voteData} runId={runConfig.id} />
    </div>
  )
}
