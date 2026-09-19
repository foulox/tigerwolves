import { fetchWorkoutVariants, fetchSchedule, getLeaderRun, getRunRoster, generateScheduleHorizon, getRunLibraryFamilyIds, getLeaderRuns, fetchRunGroups } from '@/lib/db'
import ScheduleClient from '@/components/ScheduleClient'
import { getVoteData, workoutVoteId } from '@/lib/votes'
import { requireLeaderPage } from '@/lib/requireLeaderPage'
import type { RunConfig, WorkoutVariantRow } from '@/lib/data'

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  // #337: block signed-in non-leaders at the route, not just at the write actions.
  // Past this line `user` is always a leader, so there are no non-leader branches below.
  const user = await requireLeaderPage()

  // Identify this leader's run (falls back to TigerWolves config if not found)
  const tigerWolvesConfig: RunConfig = {
    id: 'tigerwolves', name: 'TigerWolves', emoji: '🐯🐺', dayOfWeek: 'Tuesday',
    postHeader: '🐯🐺 TigerWolves Tuesday Workout',
    meetingLocation: 'Starting point and route: Tom Stofka Garden, aka "Da Bins."\nWe\'ll warm up by jogging to Marsha P. Johnson which is at the corner of North 8th and Kent\nThe run will be along the Kent Avenue Speedway\nWe\'ll finish up back at Marsha P. Johnson State Park and cool down with a jog to the track',
    leaderIntro: 'Run Leaders:',
    closingNotes: 'Bag Drop: Sorry, Not available',
    kind: 'Workout',
    workoutTypes: ['Hills', 'Broken Tempo', 'Progression', 'Ladder', 'Superset', 'Straight Tempo', 'Threshold'],
    // Fallback serves a leader not yet linked to a run (no workout scoping); a linked
    // leader's real run_group_id comes from getLeaderRun.
    runGroupId: null,
    cycleMode: 'none',
    cycle: {},
    status: 'live',
    postTemplate: null,
  }
  const leaderRun = await getLeaderRun(user.id)
  const runConfig = leaderRun ?? tigerWolvesConfig
  const runLeaders = await getRunRoster(runConfig.id)
  const roster = runLeaders
    .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999))
    .map(l => l.name)

  // Auto-generate schedule horizon (idempotent, runs outside cache)
  await generateScheduleHorizon(runConfig.id, runConfig.dayOfWeek, runLeaders)

  // Schedule filtered to this leader's run. Workout variants are the full shared catalog
  // (#347) — ScheduleClient scopes it client-side by category + the run's types.
  // #402: read variants via fetchWorkoutVariants keyed to the run this leader LEADS
  // (`leaderRun.id`), NOT via the cached fetchData() aggregate. fetchData() is a single
  // global cache shared across every user/run, so it can't carry per-run recency — it
  // always returned lastRan=null here, which is why the Schedule picker showed "Never"
  // for every workout while the Library (already per-run) showed real dates. The
  // trade-off is one uncached per-run query per load, same as the Library page.
  // The `.catch(() => [])` restores the error isolation fetchData() gave for free: on
  // a branch where migrate-402's `last_ran` column hasn't been applied yet (the #238/
  // #272 hazard — a deploy landing ahead of its migration), the workout_variants read
  // throws; degrade to an empty picker rather than crashing the whole Schedule page
  // (schedule + roster still render). Same posture as fetchData's own try/catch.
  // #404: the run's library membership (created + adopted) — the Schedule picker
  // scopes to it (AC3), replacing #401's run_group_id ownership check. Empty for a
  // run not reconciled to a group (runGroupId null), where ScheduleClient falls back
  // to the full catalog exactly as #401 did.
  // #405: ledRuns + runGroupNames drive the "All runs" borrow mode's "+ Add to my run"
  // adopt affordance (reusing #404's AdoptRouteControls) and the "adopted from <creator>"
  // credit — mirrors what the Library page fetches for the same control.
  const [schedule, workoutVariants, libraryFamilyIds, ledRuns, runGroups] = await Promise.all([
    fetchSchedule(runConfig.id),
    fetchWorkoutVariants(undefined, leaderRun?.id).catch((): WorkoutVariantRow[] => []),
    runConfig.runGroupId != null ? getRunLibraryFamilyIds(runConfig.id) : Promise.resolve<number[]>([]),
    getLeaderRuns(user.id),
    fetchRunGroups(),
  ])
  const runGroupNames: Record<number, string> = Object.fromEntries(runGroups.map(g => [g.id, g.name]))
  const today = new Date().toISOString().slice(0, 10)

  const upcoming = schedule
    .filter(e => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))

  const { week } = await searchParams
  const initialWeekIndex = Math.min(Math.max(parseInt(week ?? '0', 10) || 0, 0), upcoming.length - 1)

  const voteData = await getVoteData(workoutVariants.map(w => workoutVoteId(w.name, w.label ?? '')))

  return <ScheduleClient
    upcoming={upcoming}
    variants={workoutVariants}
    initialWeekIndex={initialWeekIndex}
    isLeader={true}
    voteData={voteData}
    runConfig={runConfig}
    roster={roster}
    runLeaders={runLeaders}
    libraryFamilyIds={libraryFamilyIds}
    ledRuns={ledRuns}
    runGroupNames={runGroupNames}
  />
}
