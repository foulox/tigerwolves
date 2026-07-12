import { NextRequest, NextResponse } from 'next/server'
import { castVote, ratingToEmoji } from '@/lib/votes'
import { captureServerEvent } from '@/lib/analytics'
import type { Rating } from '@/lib/votes'

export async function POST(req: NextRequest) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true') {
    return NextResponse.json({ avg: 4, count: 1 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { workoutId, workoutName, rating, previousRating } = body as {
    workoutId?: unknown
    workoutName?: unknown
    rating?: unknown
    previousRating?: unknown
  }

  if (!workoutId || typeof workoutId !== 'string') {
    return NextResponse.json({ error: 'workoutId required' }, { status: 400 })
  }
  if (typeof rating !== 'number' || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
    return NextResponse.json({ error: 'rating must be integer 1–5' }, { status: 400 })
  }

  const prevRating = typeof previousRating === 'number' && previousRating >= 1 && previousRating <= 5 && Number.isInteger(previousRating)
    ? (previousRating as Rating)
    : undefined

  const voteData = await castVote(workoutId, rating as Rating, prevRating)

  await captureServerEvent('reaction_cast', {
    workoutId,
    workoutName: typeof workoutName === 'string' ? workoutName : workoutId,
    rating,
    emoji: ratingToEmoji(rating),
    is_change: !!prevRating,
  })

  // voteData is null only if all buckets sum to zero after the pipeline (e.g. negative counts
  // clamped out by computeVoteData). Fall back to the just-cast vote so the client always
  // gets a valid { avg, count } rather than a null/empty response.
  return NextResponse.json(voteData ?? { avg: rating, count: 1 })
}
