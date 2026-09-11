import type { RunLeader } from './data'

export function isLeaderAway(leader: RunLeader, date: string): boolean {
  return leader.awayPeriods.some(p => p.from <= date && date <= p.to)
}

export function getNextLeader(
  roster: RunLeader[],
  afterName: string,
  forDate: string,
): string | null {
  const sorted = [...roster].sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999))
  if (sorted.length === 0) return null
  const currentIdx = sorted.findIndex(l => l.name === afterName)
  // When afterName isn't in the roster (e.g. bootstrapping a brand-new run with no
  // prior leader, or after a manual override references someone off-roster), start
  // the rotation AT the first leader — currentIdx + 1 would skip index 0 entirely.
  const firstCandidate = currentIdx === -1 ? 0 : currentIdx + 1

  for (let i = 0; i < sorted.length; i++) {
    const candidate = sorted[(firstCandidate + i) % sorted.length]
    if (!isLeaderAway(candidate, forDate)) return candidate.name
  }
  return null // all away
}
