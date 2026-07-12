import { kv } from '@vercel/kv'

export const EMOJIS = ['😡', '😒', '😐', '😃', '🥳'] as const
export type Rating = 1 | 2 | 3 | 4 | 5

export type VoteData = { avg: number; count: number }

// Stable, unique key per workout (name + variation pair).
export function workoutVoteId(name: string, variation: string): string {
  return `${name}||${variation}`
}

function ratingKey(workoutId: string, rating: Rating): string {
  return `vote:${workoutId}:${rating}`
}

function allRatingKeys(workoutId: string): string[] {
  return ([1, 2, 3, 4, 5] as Rating[]).map(r => ratingKey(workoutId, r))
}

export function ratingToEmoji(rating: number): string {
  return EMOJIS[Math.round(rating) - 1] ?? '😐'
}

function computeVoteData(counts: (number | null)[]): VoteData | null {
  let total = 0
  let weightedSum = 0
  for (let i = 0; i < 5; i++) {
    const c = Math.max(0, counts[i] ?? 0)
    total += c
    weightedSum += c * (i + 1)
  }
  if (total === 0) return null
  return { avg: Math.round(weightedSum / total), count: total }
}

export async function getVoteData(
  workoutIds: string[]
): Promise<Record<string, VoteData | null>> {
  if (workoutIds.length === 0) return {}

  const keys = workoutIds.flatMap(id => allRatingKeys(id))
  const raw = await kv.mget<(number | null)[]>(...keys)

  const result: Record<string, VoteData | null> = {}
  workoutIds.forEach((id, i) => {
    const counts = raw.slice(i * 5, i * 5 + 5)
    result[id] = computeVoteData(counts)
  })
  return result
}

export async function castVote(
  workoutId: string,
  rating: Rating,
  previousRating?: Rating
): Promise<VoteData | null> {
  const pipeline = kv.pipeline()
  if (previousRating) {
    pipeline.decr(ratingKey(workoutId, previousRating))
  }
  pipeline.incr(ratingKey(workoutId, rating))
  await pipeline.exec()

  const counts = await kv.mget<(number | null)[]>(...allRatingKeys(workoutId))
  return computeVoteData(counts)
}
