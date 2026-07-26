'use client'

import { useState, useRef, useLayoutEffect, useEffect } from 'react'
import type { ScheduleEntry, Workout } from '@/lib/data'
import { workoutVoteId } from '@/lib/votes'
import type { VoteData } from '@/lib/votes'
import ScheduleCard from '@/components/ScheduleCard'

const NEXT_UP_SCROLL_OFFSET = 50
const NEAR_TOP_THRESHOLD = 40

interface Props {
  past: ScheduleEntry[]
  pastWorkouts: (Workout | null)[]
  upcoming: ScheduleEntry[]
  upcomingWorkouts: (Workout | null)[]
  isLeader: boolean
  voteData: Record<string, VoteData | null>
}

export default function ScheduleClient({ past, pastWorkouts, upcoming, upcomingWorkouts, isLeader, voteData }: Props) {
  // Boolean, not raw scrollY — updated only when the near-top boundary is actually
  // crossed, so a scroll listener firing every frame doesn't force a re-render
  // (and a re-map of every visible card) on every pixel of scroll on mobile.
  const [nearTop, setNearTop] = useState(false)
  const nextUpRef = useRef<HTMLDivElement>(null)

  function updateNearTop() {
    setNearTop(prev => {
      const next = window.scrollY < NEAR_TOP_THRESHOLD
      return prev === next ? prev : next
    })
  }

  // Land on NEXT UP (with a sliver of the last past card peeking above) before paint,
  // so the user never sees the page start at the very top and jump.
  useLayoutEffect(() => {
    const nextUpEl = nextUpRef.current
    if (!nextUpEl) return
    const rect = nextUpEl.getBoundingClientRect()
    const target = Math.max(0, rect.top + window.scrollY - NEXT_UP_SCROLL_OFFSET)
    window.scrollTo(0, target)
    updateNearTop()
  }, [])

  useEffect(() => {
    window.addEventListener('scroll', updateNearTop, { passive: true })
    return () => window.removeEventListener('scroll', updateNearTop)
  }, [])

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="px-4 flex flex-col gap-3">
      {past.length > 0 && (
        <button
          onClick={scrollToTop}
          aria-hidden={nearTop}
          tabIndex={nearTop ? -1 : 0}
          style={{ opacity: nearTop ? 0 : 1, pointerEvents: nearTop ? 'none' : 'auto' }}
          className="sticky top-1.5 self-center z-10 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-gray-900/70 text-white text-xs font-semibold touch-manipulation transition-opacity duration-200"
        >
          <span>↑</span><span>Past weeks</span>
        </button>
      )}

      {past.map((entry, i) => {
        const workout = pastWorkouts[i]
        return (
          <ScheduleCard
            key={`past-${entry.date}-${entry.workoutName ?? ''}`}
            entry={entry}
            workout={workout}
            index={i}
            isLeader={isLeader}
            isPast
            voteData={workout ? (voteData[workoutVoteId(workout.name, workout.variation)] ?? null) : null}
          />
        )
      })}

      {upcoming.length === 0 && (
        <p className="text-gray-400 italic text-sm">No upcoming workouts scheduled yet.</p>
      )}
      {upcoming.map((entry, i) => {
        const workout = upcomingWorkouts[i]
        const key = `upcoming-${entry.date}-${entry.workoutName ?? ''}`
        const card = (
          <ScheduleCard
            entry={entry}
            workout={workout}
            index={i}
            isLeader={isLeader}
            voteData={workout ? (voteData[workoutVoteId(workout.name, workout.variation)] ?? null) : null}
          />
        )
        if (i !== 0) return <div key={key}>{card}</div>
        return (
          <div key={key} ref={nextUpRef}>
            {card}
          </div>
        )
      })}
    </div>
  )
}
