import type { NBRRun } from './allRunsData'

// #330: maps an NBR directory entry (lib/allRunsData.ts) to the platform run
// (runs.id) it represents. This is how the two sources dedup — a platform run
// "lights up" its matching NBR row as joinable instead of appearing twice
// (e.g. "Tuesday Morning Tigerwolves" collapses into the tigerwolves DB run).
// A small code map is deliberate for the trial's handful of runs (decided with
// Lou on #330) — no schema column. Extend as partner runs are seeded.
export const NBR_TO_DB_RUN: Record<string, string> = {
  'tue-tigerwolves': 'tigerwolves',
  'mon-morning-easy': 'mmer',
}

export type PlatformInfo = { runId: string; following: boolean }

// Which NBR entries correspond to a run that actually exists on the platform,
// keyed by NBR id, with the current user's follow state. Only mappings whose
// target run exists in `existingRunIds` are included — a stale map entry for an
// unseeded run is silently ignored, so it never renders as joinable. Pure.
export function computePlatformMap(
  existingRunIds: string[],
  followedRunIds: string[],
): Record<string, PlatformInfo> {
  const existing = new Set(existingRunIds)
  const followed = new Set(followedRunIds)
  const map: Record<string, PlatformInfo> = {}
  for (const [nbrId, runId] of Object.entries(NBR_TO_DB_RUN)) {
    if (existing.has(runId)) map[nbrId] = { runId, following: followed.has(runId) }
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
