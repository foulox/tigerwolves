'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Flag } from 'lucide-react'
import type { MyPlanItem } from '@/lib/myPlan'
import { compactCardFields } from '@/lib/myPlan'
import { formatDateMedium } from '@/lib/postBuilder'
import { workoutVoteId } from '@/lib/votes'
import type { VoteData } from '@/lib/votes'
import ReactionPicker from '@/components/ReactionPicker'
import WorkoutDetails, { DetailRow, ChipRow } from '@/components/WorkoutDetails'
import { FlagGhostButton, FlagWorkoutDrawer } from '@/components/WorkoutFlagSheet'
import { captureClientEvent } from '@/lib/analyticsClient'

const TYPE_PILL = 'bg-surface text-muted border border-line'

// #331 My Plan — the one new card in the runner redesign. Same frame and expanded
// fidelity as the per-run GroupRunCard (reuses WorkoutDetails verbatim so a
// Workout-kind run is field-for-field identical), plus three things that card
// doesn't have: the run-name link to /runs/[id], a kind-driven compact body, and
// collapsed-by-default. Compact field selection is shared with GroupRunCard via
// compactCardFields() so the two surfaces can't drift.
export default function MyPlanCard({
  item,
  voteData,
}: {
  item: MyPlanItem
  voteData: VoteData | null
}) {
  const { run, entry, workout } = item
  const [expanded, setExpanded] = useState(false)
  const [flagDrawerOpen, setFlagDrawerOpen] = useState(false)
  const hasWorkout = workout !== null
  const compact = compactCardFields(run.kind, entry, workout)
  const filteredVariations = entry.selectedVariations.filter(v => v !== '')
  const testId = `my-plan-card-${run.id}-${entry.date}`

  function toggleExpand() {
    if (!hasWorkout) return
    const next = !expanded
    setExpanded(next)
    if (next) {
      // #356: event name intentionally kept (renaming would split PostHog dashboard continuity)
      captureClientEvent('my_week_card_expanded', {
        runId: run.id,
        workoutName: workout?.name ?? entry.workoutName ?? '',
        kind: run.kind,
      })
    }
  }

  return (
    <div className="rounded-2xl shadow-sm border border-line bg-card touch-manipulation">
      <div
        role={hasWorkout ? 'button' : undefined}
        tabIndex={hasWorkout ? 0 : undefined}
        aria-expanded={hasWorkout ? expanded : undefined}
        className={`p-4 ${hasWorkout ? 'cursor-pointer active:bg-surface' : ''}`}
        onClick={toggleExpand}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand() } }}
        data-testid={testId}
      >
        {/* Run identity — a link to the per-run page; stops propagation so tapping
            the run name navigates instead of expanding the card. */}
        <Link
          href={`/runs/${run.id}`}
          onClick={e => e.stopPropagation()}
          data-testid={`my-plan-run-link-${run.id}`}
          className="inline-flex items-center gap-1 text-xs font-bold tracking-wide text-accent touch-manipulation"
        >
          {run.emoji ? `${run.emoji} ` : ''}{run.name}
          <span aria-hidden>›</span>
        </Link>

        <div className="mt-1 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-muted">{formatDateMedium(entry.date)}</div>
            <div className="mt-0.5 truncate text-base font-bold text-ink">
              {entry.workoutName ?? <span className="font-normal italic text-muted">Not planned yet</span>}
            </div>
            {/* Kind-aware compact body */}
            {compact.shape === 'workout' && compact.setLine && (
              <div className="mt-0.5 truncate text-sm text-muted" data-testid={`my-plan-set-${run.id}`}>
                {compact.setLine}
              </div>
            )}
            {compact.shape === 'route' && (
              <div className="mt-0.5 flex items-center gap-2 text-sm text-muted">
                {compact.distance && <span data-testid={`my-plan-distance-${run.id}`}>{compact.distance}</span>}
                {compact.routeLink && (
                  <a
                    href={compact.routeLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    data-testid={`my-plan-route-${run.id}`}
                    className="font-semibold text-accent touch-manipulation"
                  >
                    View route ↗
                  </a>
                )}
              </div>
            )}
          </div>
          {compact.shape === 'workout' && (
            <span
              className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${TYPE_PILL}`}
              data-testid={`my-plan-type-${run.id}`}
            >
              {compact.typePill}
            </span>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="min-w-0 truncate text-sm text-muted">Led by {entry.leader}</div>
          {workout && (
            <div className="shrink-0" onClick={e => e.stopPropagation()}>
              <ReactionPicker
                workoutId={workoutVoteId(workout.name, workout.label ?? '')}
                workoutName={workout.name}
                initialVoteData={voteData}
              />
            </div>
          )}
        </div>
      </div>

      {/* Expanded detail — same fields/order as the per-run GroupRunCard. */}
      {hasWorkout && expanded && (
        <div className="space-y-2 border-t border-line px-4 py-3 text-sm" data-testid={`my-plan-detail-${run.id}`}>
          {workout.rawInput && <DetailRow label="Instructions" value={workout.rawInput} />}
          {workout.coachingNotes && <DetailRow label="Coach Notes" value={workout.coachingNotes} />}
          {workout.distTime && <DetailRow label="Distance / Time" value={workout.distTime} />}
          <WorkoutDetails w={workout} />
          {filteredVariations.length > 0 && <ChipRow label="Variations" chips={filteredVariations} />}
          <div className="flex items-center justify-between gap-2">
            <ReactionPicker
              workoutId={workoutVoteId(workout.name, workout.label ?? '')}
              workoutName={workout.name}
              initialVoteData={voteData}
            />
            {workout.flagged ? (
              <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-red-100 px-3 py-1.5 text-xs font-bold text-red-800">
                <Flag size={12} />
                Issue reported
              </span>
            ) : (
              <FlagGhostButton
                workoutName={workout.name}
                onClick={e => { e.stopPropagation(); setFlagDrawerOpen(true) }}
              />
            )}
          </div>
        </div>
      )}
      {workout && flagDrawerOpen && (
        <FlagWorkoutDrawer workout={workout} onClose={() => setFlagDrawerOpen(false)} />
      )}
    </div>
  )
}
