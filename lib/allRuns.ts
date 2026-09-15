import type { NBRRun } from './allRunsData'
import {
  KIND_TO_NBR_CATEGORY,
  DAY_FULL_TO_ABBREV,
  parseStartHour,
  type NBRCategory,
  type DayAbbrev,
} from './runProfile'

// #360: Minimal DB run row shape consumed by this module. Field names and
// nullability must stay assignable from Task 3's actual Neon query row type.
type DbRunRow = {
  id: string
  name: string
  day_of_week: string | null
  meeting_time: string | null
  meeting_location: string | null
  kind: string | null
  emoji: string | null
  nbr_directory_id: string | null
}

export type PlatformInfo = { runId: string; following: boolean; draft: boolean }

// #360: Synthesize an NBRRun-shaped card from a DB run row for runs that have
// no matching NBR directory entry (nbr_directory_id is null). The synthesized
// card uses the DB run's own id so computeTiers places it in following/onApp.
export function dbRunToNbrCard(run: DbRunRow): NBRRun {
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
    startTime: run.meeting_time ?? '',
    startHour: parseStartHour(run.meeting_time),
    location: run.meeting_location ?? '',
    distance: '',
    category,
  }
}

// #360: Build the full card list for the All Runs page: the static NBR directory
// (unchanged) PLUS a synthesized card for each DB run that has no directory link
// (nbr_directory_id is null/falsy). A linked DB run is already represented by
// its NBR directory card — don't duplicate it (AC2).
export function mergeDirectory(
  nbrRuns: NBRRun[],
  dbRuns: DbRunRow[],
  links: Record<string, string>,
): NBRRun[] {
  // Build the set of run IDs that already have a directory card (are linked).
  const linkedRunIds = new Set(Object.values(links))
  const synthesized = dbRuns
    // Both guards agree in practice (links is derived from these same rows in page.tsx);
    // belt-and-suspenders against a stale link.
    .filter(run => !run.nbr_directory_id && !linkedRunIds.has(run.id))
    .map(dbRunToNbrCard)
  return [...nbrRuns, ...synthesized]
}

// #360: Build the platform map from DB-sourced links (nbr_directory_id → runId)
// instead of the former hardcoded NBR_TO_DB_RUN constant. For each existing run:
//   - if a directory link exists, key by the directory card id (lights up the NBR card)
//   - otherwise, key by the run's own id (matches its synthesized card → on-app tier)
// A link whose target run isn't in existingRunIds is silently ignored. Pure.
// #353: draftRunIds stamps draft:true on runs not yet open for joining.
export function computePlatformMap(
  existingRunIds: string[],
  followedRunIds: string[],
  links: Record<string, string>,
  draftRunIds: string[],
): Record<string, PlatformInfo> {
  // reverse: runId -> nbr_directory_id (its directory card id)
  const reverse = new Map(Object.entries(links).map(([nbrId, runId]) => [runId, nbrId]))
  const followed = new Set(followedRunIds)
  const draft = new Set(draftRunIds)
  const map: Record<string, PlatformInfo> = {}
  for (const runId of existingRunIds) {
    const cardId = reverse.get(runId) ?? runId   // linked -> directory card id; else its own id
    map[cardId] = { runId, following: followed.has(runId), draft: draft.has(runId) }
  }
  return map
}

// The three All Runs tiers for a signed-in user:
// - following: platform runs the user has joined
// - onApp:     platform runs available to join
// - moreNbr:   everything else (directory-only, muted, not joinable)
// Pure classification over the master NBR list + the platform map.
export function computeTiers(
  runs: NBRRun[],
  platform: Record<string, PlatformInfo>,
): { following: NBRRun[]; onApp: NBRRun[]; moreNbr: NBRRun[] } {
  const following: NBRRun[] = []
  const onApp: NBRRun[] = []
  const moreNbr: NBRRun[] = []
  for (const run of runs) {
    const p = platform[run.id]
    if (!p) moreNbr.push(run)
    else if (p.following) following.push(run)
    else onApp.push(run)
  }
  return { following, onApp, moreNbr }
}
