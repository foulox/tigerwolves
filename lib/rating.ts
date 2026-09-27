import type { VoteData } from './votes'

// Story #241: the four rating filter thresholds shared by the Schedule browse
// list and the Library. Filter on the RAW average (VoteData.avg, already rounded
// 1–5 in lib/votes.ts) with NO minimum vote count — the card shows counts so the
// leader judges reliability. A null entry or count === 0 means "no votes" and
// fails every non-"any" threshold (a zero-vote row is not "well-liked").
export type RatingThreshold = 'any' | 'ok' | 'good' | 'love'

export const RATING_THRESHOLD_MIN: Record<Exclude<RatingThreshold, 'any'>, number> = {
  ok: 3,
  good: 4,
  love: 5,
}

export function passesRatingThreshold(
  v: VoteData | null | undefined,
  threshold: RatingThreshold,
): boolean {
  if (threshold === 'any') return true
  if (!v || v.count === 0) return false
  return v.avg >= RATING_THRESHOLD_MIN[threshold]
}
