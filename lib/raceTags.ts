import { kv } from '@vercel/kv'

export const RACE_TIERS = ['target', 'tuneup', 'fun'] as const
export type RaceTier = typeof RACE_TIERS[number]
export type RaceTally = Record<RaceTier, number>

function tierKey(raceId: number, tier: RaceTier): string {
  const env = process.env.VERCEL_ENV ?? 'development'
  return `race-tag:${env}:${raceId}:${tier}`
}

function allTierKeys(raceId: number): string[] {
  return RACE_TIERS.map(t => tierKey(raceId, t))
}

function toTally(counts: (number | null)[]): RaceTally {
  return {
    target: Math.max(0, counts[0] ?? 0),
    tuneup: Math.max(0, counts[1] ?? 0),
    fun: Math.max(0, counts[2] ?? 0),
  }
}

export async function getRaceTallies(raceIds: number[]): Promise<Record<number, RaceTally>> {
  if (raceIds.length === 0) return {}

  const keys = raceIds.flatMap(id => allTierKeys(id))
  const raw = await kv.mget<(number | null)[]>(...keys)

  const result: Record<number, RaceTally> = {}
  raceIds.forEach((id, i) => {
    result[id] = toTally(raw.slice(i * 3, i * 3 + 3))
  })
  return result
}

// tier is null for an untag (remove my own tag, don't add a new one) — unlike a
// workout reaction, a race tag can be cleared entirely by tapping the same pill again.
export async function castRaceTag(
  raceId: number,
  tier: RaceTier | null,
  previousTier?: RaceTier
): Promise<RaceTally> {
  const pipeline = kv.pipeline()
  if (previousTier) pipeline.decr(tierKey(raceId, previousTier))
  if (tier) pipeline.incr(tierKey(raceId, tier))
  await pipeline.exec()

  const raw = await kv.mget<(number | null)[]>(...allTierKeys(raceId))
  return toTally(raw)
}
