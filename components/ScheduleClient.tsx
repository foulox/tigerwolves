'use client'

import { useState, useRef, useLayoutEffect, useEffect } from 'react'
import type { ScheduleEntry, Workout } from '@/lib/data'
import { workoutVoteId } from '@/lib/votes'
import type { VoteData } from '@/lib/votes'
import ScheduleCard from '@/components/ScheduleCard'

const NEXT_UP_SCROLL_OFFSET = 50
const NEAR_TOP_THRESHOLD = 40
const NEXT_UP_BUTTON_MARGIN = 20

interface Props {
  past: ScheduleEntry[]
  pastWorkouts: (Workout | null)[]
  upcoming: ScheduleEntry[]
  upcomingWorkouts: (Workout | null)[]
  isLeader: boolean
  voteData: Record<string, VoteData | null>
}

export default function ScheduleClient({ past, pastWorkouts, upcoming, upcomingWorkouts, isLeader, voteData }: Props) {
  // Booleans, not raw scrollY — updated only when a boundary is actually crossed,
  // so a scroll listener firing every frame doesn't force a re-render (and a
  // re-map of every visible card) on every pixel of scroll on mobile.
  const [nearTop, setNearTop] = useState(false)
  const [aboveNextUp, setAboveNextUp] = useState(false)
  const nextUpRef = useRef<HTMLDivElement>(null)
  const landingTargetRef = useRef(0)
  // The page header is sticky (app/page.tsx) — measured once and applied directly
  // to the DOM (not React state) so the "Past weeks" hint pill sticks just below
  // it instead of being hidden underneath it. Purely a one-time layout measurement,
  // not a value the rest of the render needs to react to.
  const hintRef = useRef<HTMLButtonElement>(null)

  function updateScrollState() {
    const y = window.scrollY
    setNearTop(prev => {
      const next = y < NEAR_TOP_THRESHOLD
      return prev === next ? prev : next
    })
    setAboveNextUp(prev => {
      const next = y < landingTargetRef.current - NEXT_UP_BUTTON_MARGIN
      return prev === next ? prev : next
    })
  }

  // Land on NEXT UP (with a sliver of the last past card peeking above) before paint,
  // so the user never sees the page start at the very top and jump.
  useLayoutEffect(() => {
    const headerHeight = document.querySelector('header')?.getBoundingClientRect().height ?? 0
    if (hintRef.current) hintRef.current.style.top = `${headerHeight + 8}px`

    const nextUpEl = nextUpRef.current
    if (!nextUpEl) return
    const rect = nextUpEl.getBoundingClientRect()
    const target = Math.max(0, rect.top + window.scrollY - NEXT_UP_SCROLL_OFFSET)
    landingTargetRef.current = target
    window.scrollTo(0, target)
    updateScrollState()
  }, [])

  useEffect(() => {
    window.addEventListener('scroll', updateScrollState, { passive: true })
    return () => window.removeEventListener('scroll', updateScrollState)
  }, [])

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function scrollToNextUp() {
    window.scrollTo({ top: landingTargetRef.current, behavior: 'smooth' })
  }

  return (
    <div className="px-4 flex flex-col gap-3">
      {past.length > 0 && (
        <button
          ref={hintRef}
          onClick={scrollToTop}
          aria-hidden={nearTop}
          tabIndex={nearTop ? -1 : 0}
          style={{ top: 8, opacity: nearTop ? 0 : 1, pointerEvents: nearTop ? 'none' : 'auto' }}
          className="sticky self-center z-10 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-gray-900/70 text-white text-xs font-semibold touch-manipulation transition-opacity duration-200"
        >
          <span>↑</span><span>Past weeks</span>
        </button>
      )}

      {past.length > 0 && (
        <button
          onClick={scrollToNextUp}
          aria-hidden={!aboveNextUp}
          tabIndex={aboveNextUp ? 0 : -1}
          style={{ opacity: aboveNextUp ? 1 : 0, pointerEvents: aboveNextUp ? 'auto' : 'none' }}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-gray-900/70 text-white text-xs font-semibold touch-manipulation transition-opacity duration-200"
        >
          <span>↓</span><span>Next up</span>
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
