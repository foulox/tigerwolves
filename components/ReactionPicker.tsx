'use client'

import { useState, useEffect, useRef } from 'react'
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
  const [isOpen, setIsOpen] = useState(false)
  const [voteData, setVoteData] = useState<VoteData | null>(initialVoteData)
  const [myRating, setMyRating] = useState<Rating | undefined>(undefined)
  const [pending, setPending] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMyRating(readStoredRating(workoutId))
  }, [workoutId])

  useEffect(() => {
    if (!isOpen) return
    const handleOutside = (e: Event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
    }
  }, [isOpen])

  async function handleSelect(rating: Rating) {
    if (pending) return
    const previousRating = myRating
    setMyRating(rating)
    writeStoredRating(workoutId, rating)
    setIsOpen(false)
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

  const hasVotes = voteData !== null && voteData.count > 0
  const avgEmoji = hasVotes ? ratingToEmoji(voteData!.avg) : null

  return (
    <div ref={wrapperRef} className="relative inline-block">
      {isOpen && (
        <div className="absolute bottom-full right-0 mb-1 bg-white rounded-2xl shadow-lg border border-gray-100 px-3 py-2 flex gap-1 z-50">
          {EMOJIS.map((emoji, i) => {
            const rating = (i + 1) as Rating
            const selected = myRating === rating
            return (
              <button
                key={rating}
                onClick={(e) => { e.stopPropagation(); handleSelect(rating) }}
                disabled={pending}
                className={`text-xl leading-none px-1.5 py-1 rounded-lg touch-manipulation ${
                  selected ? 'ring-2 ring-orange-400 bg-orange-50' : 'active:scale-110'
                }`}
                aria-label={`React ${emoji}`}
              >
                {emoji}
              </button>
            )
          })}
        </div>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); setIsOpen(v => !v) }}
        disabled={pending}
        className={`touch-manipulation whitespace-nowrap text-sm px-2.5 py-1 rounded-full ${
          hasVotes
            ? 'bg-orange-50 border border-orange-200 text-orange-700'
            : 'border border-dashed border-gray-300 text-gray-400'
        }`}
        aria-label={hasVotes ? 'Open reaction picker' : 'Add a reaction'}
      >
        {!hasVotes && '🙂 React'}
        {hasVotes && !myRating && `${avgEmoji} ${voteData!.count} · Add yours`}
        {hasVotes && myRating && `${avgEmoji} ${voteData!.count}`}
      </button>
    </div>
  )
}
