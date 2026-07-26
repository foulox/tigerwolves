'use client'

import { useState, useRef, useLayoutEffect, useEffect } from 'react'
import type { ScheduleEntry, Workout } from '@/lib/data'
import { workoutVoteId } from '@/lib/votes'
import type { VoteData } from '@/lib/votes'
import ScheduleCard from '@/components/ScheduleCard'

const NEXT_UP_PAST_SLIVER = 50
const PILL_GAP = 8
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
  // True once scrolled up above the NEXT UP landing spot (i.e. viewing past weeks).
  // A boolean, not raw scrollY — updated only when the boundary is actually
  // crossed, so a scroll listener firing every frame doesn't force a re-render
  // (and a re-map of every visible card) on every pixel of scroll on mobile.
  const [aboveNextUp, setAboveNextUp] = useState(false)
  const nextUpRef = useRef<HTMLDivElement>(null)
  const landingTargetRef = useRef(0)
  // The page header is sticky (app/page.tsx) — measured once and applied directly
  // to the DOM (not React state) so the pill floats just below it instead of
  // being hidden underneath it. A one-time layout measurement, not a value the
  // rest of the render needs to react to.
  const pillRef = useRef<HTMLButtonElement>(null)

  function updateScrollState() {
    const y = window.scrollY
    setAboveNextUp(prev => {
      const next = y < landingTargetRef.current - NEXT_UP_BUTTON_MARGIN
      return prev === next ? prev : next
    })
  }

  // Land on NEXT UP (with a sliver of the last past card peeking above) before paint,
  // so the user never sees the page start at the very top and jump.
  useLayoutEffect(() => {
    function landOnNextUp() {
      const headerHeight = document.querySelector('header')?.getBoundingClientRect().height ?? 0
      const pillHeight = pillRef.current?.getBoundingClientRect().height ?? 0
      if (pillRef.current) pillRef.current.style.top = `${headerHeight + PILL_GAP}px`

      const nextUpEl = nextUpRef.current
      if (!nextUpEl) return
      const rect = nextUpEl.getBoundingClientRect()
      // The header (sticky) and pill (fixed) both float over the top of the viewport
      // regardless of scroll position — landing NEXT UP's top based on a flat offset
      // from the viewport edge (ignoring them) put it right underneath both. Clear
      // their combined height first, then leave the intended sliver of the last
      // past card peeking above that.
      const topClearance = headerHeight + pillHeight + PILL_GAP + NEXT_UP_PAST_SLIVER
      const target = Math.max(0, rect.top + window.scrollY - topClearance)
      landingTargetRef.current = target
      window.scrollTo(0, target)
      updateScrollState()
    }

    landOnNextUp()

    // Client-only widgets in the header (Clerk's <UserButton /> for signed-in
    // leaders) hydrate and can change the header's real height shortly after
    // this first paint — the page's true scrollable height isn't settled yet
    // at this exact instant, so the scrollTo above can silently clamp short of
    // the intended target (confirmed: signed-out landed correctly, signed-in
    // stayed near the very top). Re-run while layout is still settling, for a
    // bounded window, instead of leaving the user stranded once it shifts.
    const observer = new ResizeObserver(() => landOnNextUp())
    observer.observe(document.body)
    const stopObserving = setTimeout(() => observer.disconnect(), 2000)

    return () => {
      observer.disconnect()
      clearTimeout(stopObserving)
    }
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
        // Fixed, not sticky — a single pill that swaps direction/label based on
        // scroll position. Deliberately not CSS `position: sticky`: its "stuck"
        // range would span the whole card list (past + upcoming together), so it
        // would never un-stick once scrolled past the past weeks, overlapping
        // NEXT UP and beyond. `fixed` + state gives exact control instead.
        <button
          ref={pillRef}
          onClick={aboveNextUp ? scrollToNextUp : scrollToTop}
          className="fixed left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-gray-900/70 text-white text-xs font-semibold touch-manipulation"
        >
          {aboveNextUp ? (
            <><span>↓</span><span>Next up</span></>
          ) : (
            <><span>↑</span><span>Past weeks</span></>
          )}
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
