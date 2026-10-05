'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Flag } from 'lucide-react'
import type { ScheduleEntry, WorkoutVariantRow } from '@/lib/data'
import { formatDateMedium } from '@/lib/postBuilder'
import { workoutVoteId } from '@/lib/votes'
import type { VoteData } from '@/lib/votes'
import ReactionPicker from '@/components/ReactionPicker'
import WorkoutFlagSheet, { FlagBadge, FlagGhostButton, FlagWorkoutDrawer } from '@/components/WorkoutFlagSheet'
import { captureClientEvent } from '@/lib/analyticsClient'
import WorkoutDetails, { DetailRow, ChipRow } from '@/components/WorkoutDetails'
import { compactCardFields } from '@/lib/myPlan'

const TYPE_PILL = 'bg-surface text-muted border border-line'

interface Props {
  entry: ScheduleEntry
  workout: WorkoutVariantRow | null
  index: number
  isLeader: boolean
  voteData?: VoteData | null
  isPast?: boolean
  // #331: when provided, the compact body becomes kind-aware (Workout → type pill +
  // short set line; Easy/route → distance + "View route ↗", no type pill). Omitted
  // on the live `/` Schedule page so it keeps today's look; the per-run page passes
  // its run's kind.
  kind?: string
}

export default function GroupRunCard({ entry, workout, index, isLeader, voteData, isPast = false, kind }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [flagDrawerOpen, setFlagDrawerOpen] = useState(false)
  const [flagSheetOpen, setFlagSheetOpen] = useState(false)
  const isNext = !isPast && index === 0
  const hasWorkout = workout !== null
  const compact = kind ? compactCardFields(kind, entry, workout) : null
  const filteredVariations = entry.selectedVariations.filter(v => v !== '')
  const cardTestId = isPast ? `past-card-${index}` : `schedule-card-${index}`
  const detailTestId = isPast ? `past-detail-${index}` : `schedule-detail-${index}`

  function toggleExpand() {
    if (!hasWorkout) return
    const next = !expanded
    setExpanded(next)
    if (next) {
      captureClientEvent('schedule_card_expanded', {
        workoutName: workout?.name ?? entry.workoutName ?? '',
        workoutType: entry.workoutType,
        card_index: index,
      })
    }
  }

  return (
    <div
      className={`rounded-2xl shadow-sm border touch-manipulation ${
        isPast ? 'bg-surface border-line' : isNext ? 'bg-card border-accent' : 'bg-card border-line'
      }`}
    >
      {/* Card header — interactive when workout exists */}
      <div
        role={hasWorkout ? 'button' : undefined}
        tabIndex={hasWorkout ? 0 : undefined}
        aria-expanded={hasWorkout ? expanded : undefined}
        className={`p-4 ${hasWorkout ? 'cursor-pointer active:bg-surface' : ''}`}
        onClick={toggleExpand}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand() } }}
        data-testid={cardTestId}
        data-tour={isNext ? 'schedule-detail' : undefined}
      >
        {isNext && <div className="text-xs font-bold text-accent tracking-wide mb-1">NEXT UP</div>}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-muted">{formatDateMedium(entry.date)}</div>
            <div className={`mt-0.5 truncate ${isPast ? 'text-sm font-semibold text-muted' : 'text-base font-bold text-ink'}`}>
              {entry.workoutName ?? <span className="text-muted font-normal italic">Not planned yet</span>}
            </div>
            {/* #331: kind-aware compact body (only when a kind is supplied). */}
            {compact?.shape === 'workout' && compact.setLine && (
              <div className="mt-0.5 truncate text-sm text-muted" data-testid={`schedule-set-${index}`}>
                {compact.setLine}
              </div>
            )}
            {compact?.shape === 'route' && (
              <div className="mt-0.5 flex items-center gap-2 text-sm text-muted">
                {compact.distance && <span data-testid={`schedule-distance-${index}`}>{compact.distance}</span>}
                {compact.routeLink && (
                  <a
                    href={compact.routeLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    data-testid={`schedule-route-${index}`}
                    className="font-semibold text-accent touch-manipulation"
                  >
                    View route ↗
                  </a>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="flex items-center gap-1.5">
              {workout && workout.flagged && (
                <FlagBadge onClick={(e) => { e.stopPropagation(); setFlagSheetOpen(true) }} />
              )}
              {compact?.shape !== 'route' && (
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${TYPE_PILL}`}
                >
                  {entry.workoutType}
                </span>
              )}
            </div>
            {isLeader && isPast && hasWorkout && (
              <Link
                href={`/library/edit?variantId=${workout.id}`}
                className="text-xs font-semibold text-muted border border-line rounded-full px-3 py-1 bg-card active:bg-surface touch-manipulation whitespace-nowrap"
                onClick={(e) => e.stopPropagation()}
                data-testid={`edit-in-library-${index}`}
              >
                Edit in library →
              </Link>
            )}
            {isLeader && !isPast && (
              <Link
                href={`/schedule?week=${index}`}
                className="text-xs font-semibold text-accent border border-accent rounded-full px-3 py-1 active:bg-surface touch-manipulation whitespace-nowrap"
                onClick={(e) => e.stopPropagation()}
                data-testid={`schedule-week-${index}`}
              >
                Edit schedule →
              </Link>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 mt-2">
          <div className="text-sm min-w-0 truncate text-muted">Led by {entry.leader}</div>
          {workout && (
            <div className="shrink-0" onClick={(e) => e.stopPropagation()} data-tour={isNext ? 'schedule-reactions' : undefined}>
              <ReactionPicker
                workoutId={workoutVoteId(workout.name, workout.label ?? '')}
                workoutName={workout.name}
                initialVoteData={voteData ?? null}
                muted={isPast}
              />
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {hasWorkout && expanded && (
        <div className="border-t border-line px-4 py-3 space-y-2 text-sm" data-testid={detailTestId}>
          {/* #288: instructions, then coach's notes (Lou prefers this over "why" as the
              second thing shown), then everything else that has a value — reason included
              further down rather than dropped */}
          {workout.rawInput && <DetailRow label="Instructions" value={workout.rawInput} />}
          {workout.coachingNotes && <DetailRow label="Coach Notes" value={workout.coachingNotes} />}
          {workout.distTime && <DetailRow label="Distance / Time" value={workout.distTime} />}
          <WorkoutDetails w={workout} />
          {filteredVariations.length > 0 && (
            <ChipRow label="Variations" chips={filteredVariations} />
          )}
          <div className="flex items-center justify-between gap-2">
            <ReactionPicker
              workoutId={workoutVoteId(workout.name, workout.label ?? '')}
              workoutName={workout.name}
              initialVoteData={voteData ?? null}
              muted={isPast}
            />
            {workout.flagged ? (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setFlagSheetOpen(true) }}
                className="flex items-center gap-1.5 bg-red-100 text-red-800 rounded-full px-3 py-1.5 text-xs font-bold shrink-0 touch-manipulation"
              >
                <Flag size={12} />
                Issue reported
              </button>
            ) : (
              <FlagGhostButton
                workoutName={workout.name}
                onClick={e => { e.stopPropagation(); setFlagDrawerOpen(true) }}
                dataTour={isNext ? 'schedule-flag' : undefined}
              />
            )}
          </div>
        </div>
      )}
      {workout && flagDrawerOpen && (
        <FlagWorkoutDrawer workout={workout} onClose={() => setFlagDrawerOpen(false)} />
      )}
      {workout && workout.flagged && flagSheetOpen && (
        <WorkoutFlagSheet workout={workout} isLeader={isLeader} onClose={() => setFlagSheetOpen(false)} />
      )}
    </div>
  )
}

