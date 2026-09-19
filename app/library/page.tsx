import { currentUser } from '@clerk/nextjs/server'
import { fetchWorkoutVariants, getLeaderRun, getRunLibraryFamilyIds, getLeaderRuns, fetchRunGroups } from '@/lib/db'
import LibraryClient from '@/components/LibraryClient'
import Header from '@/components/Header'
import { getVoteData, workoutVoteId } from '@/lib/votes'
import type { RunConfig, WorkoutVariantRow } from '@/lib/data'

export default async function LibraryPage() {
  const user = await currentUser()
  const isLeader = user?.publicMetadata?.role === 'leader'
  // #404 (review): route Delete is global (removes the canonical route for every run),
  // so it's gated to the cross-run admin flag — not any leader. Same flag as
  // requireAdminPage / isAdminUser. Non-admins un-adopt instead and request a delete.
  const isAdmin = user?.publicMetadata?.admin === true

  // Identify this leader's run (falls back to TigerWolves config if not found)
  const tigerWolvesConfig: RunConfig = {
    id: 'tigerwolves', name: 'TigerWolves', emoji: '🐯🐺', dayOfWeek: 'Tuesday',
    postHeader: '🐯🐺 TigerWolves Tuesday Workout',
    meetingLocation: 'Starting point and route: Tom Stofka Garden, aka "Da Bins."\nWe\'ll warm up by jogging to Marsha P. Johnson which is at the corner of North 8th and Kent\nThe run will be along the Kent Avenue Speedway\nWe\'ll finish up back at Marsha P. Johnson State Park and cool down with a jog to the track',
    leaderIntro: 'Run Leaders:',
    closingNotes: 'Bag Drop: Sorry, Not available',
    kind: 'Workout',
    workoutTypes: ['Hills', 'Broken Tempo', 'Progression', 'Ladder', 'Superset', 'Straight Tempo', 'Threshold', 'Intervals'],
    // Fallback only serves anonymous/non-leader views (no workout scoping); the real
    // run_group_id comes from getLeaderRun for signed-in leaders.
    runGroupId: null,
    cycleMode: 'none',
    cycle: {},
    status: 'live',
    postTemplate: null,
  }
  // The run this leader actually leads (null for anonymous/non-leader/unlinked).
  const leaderRun = user && isLeader ? await getLeaderRun(user.id) : null
  const runConfig = leaderRun ?? tigerWolvesConfig
  // #401: fetch the FULL shared catalog (no runId scoping) so the "All runs" escape
  // hatch can browse everything. "Your run" scoping is applied client-side by library
  // membership in LibraryClient — the read that AC2 turns on.
  // #402: key recency to the run this leader LEADS (`leaderRun.id`), so each card's
  // "Last ran" is that run's date even while browsing the full catalog (AC6). Keyed on
  // the led run itself — NOT on run_group_id — because recency lives on run_workouts
  // (keyed by run_id) and is independent of whether the run is reconciled to a group; a
  // group-less run (e.g. MMER) still has its own recency. Null led run → no recency run
  // → "Never" everywhere (anonymous/unlinked fallback).
  // `.catch(() => [])`: this call (like the Schedule page's) now hard-depends on
  // migrate-402's `last_ran` column. On a branch where the migration hasn't landed yet
  // (#238/#272 hazard), degrade to an empty library rather than crashing the page — the
  // same error isolation fetchData() provides for the pages that still read through it.
  const workoutVariants = await fetchWorkoutVariants(undefined, leaderRun?.id).catch((): WorkoutVariantRow[] => [])

  // #404: "Your run" = the run's library membership (created + adopted), not the old
  // run_group_id ownership check. Only meaningful for a signed-in leader with a
  // reconciled run; anonymous/non-leader views keep the full-catalog fallback
  // (empty membership + null runGroupId in LibraryClient). ledRuns drives the adopt
  // affordance + the multi-run "which run?" picker; runGroupNames labels a route's
  // creator ("adopted from <creator>").
  const isRealLeaderRun = !!(leaderRun && runConfig.runGroupId != null)
  const [libraryFamilyIds, ledRuns, runGroups] = await Promise.all([
    isRealLeaderRun ? getRunLibraryFamilyIds(runConfig.id) : Promise.resolve<number[]>([]),
    user && isLeader ? getLeaderRuns(user.id) : Promise.resolve<Array<{ id: string; name: string }>>([]),
    fetchRunGroups(),
  ])
  const runGroupNames: Record<number, string> = Object.fromEntries(runGroups.map(g => [g.id, g.name]))

  const voteData = await getVoteData(workoutVariants.map(w => workoutVoteId(w.name, w.label ?? '')))
  return (
    <div>
      <Header title="Library" isLeader={isLeader} />
      <LibraryClient
        variants={workoutVariants}
        isLeader={isLeader}
        isAdmin={isAdmin}
        voteData={voteData}
        runId={runConfig.id}
        allowedTypes={runConfig.workoutTypes}
        runGroupId={runConfig.runGroupId}
        libraryFamilyIds={libraryFamilyIds}
        ledRuns={ledRuns}
        runGroupNames={runGroupNames}
      />
    </div>
  )
}
