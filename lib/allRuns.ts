import type { NBRRun } from './allRunsData'
import {
  KIND_TO_NBR_CATEGORY,
  DAY_FULL_TO_ABBREV,
  parseStartHour,
  formatMeetingTimeShort,
  type NBRCategory,
  type DayAbbrev,
} from './runProfile'

export { formatMeetingTimeShort } from './runProfile'

// #365: input shape for directoryRunToCard. Field names and nullability match
// the `runs` DB table. Task 4 will align lib/db.ts's DirectoryRun to this.
export type DirectoryRunInput = {
  id: string
  name: string
  day_of_week: string | null
  meeting_time: string | null
  meeting_location: string | null
  kind: string | null
  emoji: string | null
  distance: string | null
  status: RunStatus
}

export type RunStatus = 'unclaimed' | 'draft' | 'live'

export type DirectoryCard = NBRRun & { status: RunStatus }

// #365: Synthesize a DirectoryCard from a DB run row. Maps the run's
// kind/day/time to the card fields, adds `distance` (pass-through) and
// `status`, and runs `startTime` through `formatMeetingTimeShort` so the
// card always shows the compact form ('6:30am') regardless of DB format.
export function directoryRunToCard(run: DirectoryRunInput): DirectoryCard {
  const day: DayAbbrev = run.day_of_week
    ? (DAY_FULL_TO_ABBREV[run.day_of_week] ?? 'mon')
    : 'mon'
  const category: NBRCategory = run.kind
    ? (KIND_TO_NBR_CATEGORY[run.kind] ?? 'Easy Runs')
    : 'Easy Runs'
  return {
    id: run.id,
    name: run.name,
    day,
    startTime: formatMeetingTimeShort(run.meeting_time),
    startHour: parseStartHour(run.meeting_time),
    location: run.meeting_location ?? '',
    distance: run.distance ?? '',
    category,
    status: run.status,
  }
}

export type ViewerContext = {
  isLoggedIn: boolean
  isAdmin: boolean
  owningLeaderRunId: string | null
  followedRunIds: string[]
}

export type Affordance = {
  visible: boolean
  joinable: boolean
  linkable: boolean
  showDraftBadge: boolean
  following: boolean
}

// #365: Compute display affordances for a directory card given the viewer's
// context. Affordance rules are the single source of truth for what each
// run status means for each viewer type.
export function cardAffordance(
  run: { id: string; status: RunStatus },
  viewer: ViewerContext,
): Affordance {
  const canManage =
    viewer.isAdmin ||
    (viewer.owningLeaderRunId != null && viewer.owningLeaderRunId === run.id)
  // Every card is visible to everyone (incl. logged-out) — draft runs show as a
  // plain inert card (no link, no Join, no Draft badge for non-managers), not hidden.
  // Interactivity, not visibility, is what status+viewer gates.
  const visible = true
  const following = viewer.followedRunIds.includes(run.id)
  const joinable =
    run.status === 'live'
      ? viewer.isLoggedIn
      : run.status === 'draft'
        ? canManage
        : false
  const linkable =
    run.status === 'live'
      ? true
      : run.status === 'draft'
        ? canManage
        : false
  const showDraftBadge = run.status === 'draft' && canManage
  return { visible, joinable, linkable, showDraftBadge, following }
}
