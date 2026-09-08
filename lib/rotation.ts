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
  const currentIdx = sorted.findIndex(l => l.name === afterName)
  const startIdx = currentIdx === -1 ? 0 : currentIdx

  for (let i = 1; i <= sorted.length; i++) {
    const candidate = sorted[(startIdx + i) % sorted.length]
    if (!isLeaderAway(candidate, forDate)) return candidate.name
  }
  return null // all away
}
