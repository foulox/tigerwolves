import { kv } from '@vercel/kv'

export const EMOJIS = ['😡', '😒', '😐', '😃', '🥳'] as const
export type Rating = 1 | 2 | 3 | 4 | 5

export type VoteData = { avg: number; count: number }

// Stable, unique key per workout (name + variation pair).
export function workoutVoteId(name: string, variation: string): string {
  return `${name}||${variation}`
}

// Vote identity for a schedule slot (#549). A slot's planned workout_name may no
// longer resolve to a library variant (renamed / removed / legacy free-text), in
// which case the ReactionPicker would otherwise disappear. Prefer the resolved
// variant's identity (name||label) when it resolves, and fall back to the raw
// planned name so voting survives library drift. Null only when the slot has no
// planned workout at all ("Not planned yet").
export function slotVoteKey(
  workoutName: string | null,
  workout: { name: string; label: string | null } | null,
): string | null {
  if (workout) return workoutVoteId(workout.name, workout.label ?? '')
  if (workoutName) return workoutVoteId(workoutName, '')
  return null
}

function ratingKey(workoutId: string, rating: Rating): string {
  const env = process.env.VERCEL_ENV ?? 'development'
  return `vote:${env}:${workoutId}:${rating}`
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
  // Degrades to "no votes yet" rather than crashing the page, matching
  // fetchData's own resilience pattern in lib/db.ts — a Redis outage (or a
  // local/CI environment with no KV credentials at all, as in e2e) shouldn't
  // take down every page that renders a ReactionPicker.
  let raw: (number | null)[]
  try {
    raw = await kv.mget<(number | null)[]>(...keys)
  } catch {
    return {}
  }

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
