import type { VoteData } from './votes'
import { workoutVoteId } from './votes'

// Story #241: confidence-weighted ("Bayesian") sort so few votes can't beat many.
//   score = (v/(v+m)) * R  +  (m/(v+m)) * C
// R = the variant's raw average, v = its vote count, m = 5 (the vote count at
// which a variant's own average starts to dominate the shared prior), C = the
// mean average across every variant that has votes. An unrated variant (v=0)
// scores exactly C — parked at the neutral prior.
export const RATING_SORT_M = 5

export function meanOfRatedAverages(
  voteData: Record<string, VoteData | null>,
): number {
  const rated = Object.values(voteData).filter(
    (v): v is VoteData => !!v && v.count > 0,
  )
  if (rated.length === 0) return 0
  return rated.reduce((sum, v) => sum + v.avg, 0) / rated.length
}

export function ratingScore(v: VoteData | null | undefined, C: number): number {
  const R = v && v.count > 0 ? v.avg : 0
  const count = v && v.count > 0 ? v.count : 0
  const m = RATING_SORT_M
  return (count / (count + m)) * R + (m / (count + m)) * C
}

export function rankByRating<T extends { name: string; label: string | null }>(
  rows: T[],
  voteData: Record<string, VoteData | null>,
): T[] {
  const C = meanOfRatedAverages(voteData)
  // Stable sort: equal scores keep input order (callers pass least-recently-run
  // order), so "Top rated" degrades gracefully to the default when scores tie.
  return rows
    .map((row, i) => ({ row, i, score: ratingScore(voteData[workoutVoteId(row.name, row.label ?? '')], C) }))
    .sort((a, b) => (b.score - a.score) || (a.i - b.i))
    .map(x => x.row)
}
