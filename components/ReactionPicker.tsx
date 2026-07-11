'use client'

import { useState, useEffect } from 'react'
import { EMOJIS, ratingToEmoji } from '@/lib/votes'
import type { Rating, VoteData } from '@/lib/votes'

const STORAGE_KEY = 'tw_reactions'

function readStoredRating(workoutId: string): Rating | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return undefined
    const map = JSON.parse(raw) as Record<string, number>
    const v = map[workoutId]
    return v >= 1 && v <= 5 ? (v as Rating) : undefined
  } catch {
    return undefined
  }
}

function writeStoredRating(workoutId: string, rating: Rating) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const map: Record<string, number> = raw ? (JSON.parse(raw) as Record<string, number>) : {}
    map[workoutId] = rating
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // localStorage unavailable in some privacy modes — silently skip
  }
}

interface Props {
  workoutId: string
  workoutName: string
  initialVoteData: VoteData | null
}

export default function ReactionPicker({ workoutId, workoutName, initialVoteData }: Props) {
  const [voteData, setVoteData] = useState<VoteData | null>(initialVoteData)
  const [myRating, setMyRating] = useState<Rating | undefined>(undefined)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    setMyRating(readStoredRating(workoutId))
  }, [workoutId])

  async function handleSelect(rating: Rating) {
    if (pending) return
    const previousRating = myRating
    setMyRating(rating)
    writeStoredRating(workoutId, rating)
    setPending(true)

    try {
      const res = await fetch('/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workoutId, workoutName, rating, previousRating }),
      })
      if (res.ok) {
        const data = await res.json() as VoteData
        setVoteData(data)
      }
    } catch {
      // Network error — keep optimistic local state, silently skip
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex items-center gap-2 mt-3">
      <div className="flex gap-1">
        {EMOJIS.map((emoji, i) => {
          const rating = (i + 1) as Rating
          const selected = myRating === rating
          return (
            <button
              key={rating}
              onClick={() => handleSelect(rating)}
              disabled={pending}
              className={`text-xl leading-none px-1.5 py-1 rounded-lg touch-manipulation transition-all ${
                selected
                  ? 'bg-orange-100 ring-1 ring-orange-400 scale-110'
                  : 'opacity-60 active:opacity-100 active:scale-110'
              }`}
              aria-label={`React ${emoji}`}
            >
              {emoji}
            </button>
          )
        })}
      </div>
      {voteData && voteData.count > 0 && (
        <span className="text-xs text-gray-400 tabular-nums">
          {ratingToEmoji(voteData.avg)} {voteData.count}
        </span>
      )}
    </div>
  )
}
