import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { castRaceTag, RACE_TIERS } from '@/lib/raceTags'
import { captureServerEvent } from '@/lib/analytics'
import type { RaceTier } from '@/lib/raceTags'

function isTier(v: unknown): v is RaceTier {
  return typeof v === 'string' && (RACE_TIERS as readonly string[]).includes(v)
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { raceId, tier, previousTier } = body as {
    raceId?: unknown
    tier?: unknown
    previousTier?: unknown
  }

  if (typeof raceId !== 'number' || !Number.isInteger(raceId)) {
    return NextResponse.json({ error: 'raceId must be an integer' }, { status: 400 })
  }
  if (tier !== null && !isTier(tier)) {
    return NextResponse.json({ error: 'tier must be target, tuneup, fun, or null' }, { status: 400 })
  }
  const prevTier = isTier(previousTier) ? previousTier : undefined

  const tally = await castRaceTag(raceId, tier, prevTier)

  // No auth gate here — tagging is open to anonymous runners, same as workout
  // reactions. This auth() call is purely observational, to label the event.
  const { userId } = await auth()

  await captureServerEvent('race_tag_cast', userId ?? 'anonymous-runner', {
    raceId,
    tier: tier ?? 'none',
    is_change: !!prevTier,
    isLeader: !!userId,
  })

  return NextResponse.json(tally)
}
