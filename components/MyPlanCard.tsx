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
import { FlagGhostButton, FlagWorkoutDrawer } from '@/components/WorkoutFlagSheet'
import WorkoutCardBody from '@/components/WorkoutCardBody'
import { captureClientEvent } from '@/lib/analyticsClient'
import { CARD_LINK, TYPE_LABEL, CARD_NAME } from '@/lib/cardStyles'

// #331 My Plan — cross-run home card. Frame (run-name link to /runs/[id], date,
// workout name, type pill, "Led by", reactions, flag) is My Plan chrome; starts
// collapsed. #503: body rendered via WorkoutCardBody using each run's cardTemplate
// layout—condensed shows Upfront fields, "Show details" reveals When-expanded fields
// (uniform with Library/Schedule). compactCardFields() picks the type pill (kind-driven).
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
  const compact = compactCardFields(run.kind, entry, workout)
  const testId = `my-plan-card-${run.id}-${entry.date}`

  function toggleExpand() {
    if (!workout) return
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
    <div className="border border-line bg-card touch-manipulation" data-testid={testId}>
      <div className="p-4">
        {/* Run identity — a link to the per-run page. */}
        <Link
          href={`/runs/${run.id}`}
          data-testid={`my-plan-run-link-${run.id}`}
          className={`${CARD_LINK} inline-flex items-center gap-1`}
        >
          {run.emoji ? `${run.emoji} ` : ''}{run.name}
          <span aria-hidden>›</span>
        </Link>

        <div className="mt-1 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-muted">{formatDateMedium(entry.date)}</div>
            <div className={`mt-0.5 truncate ${CARD_NAME}`}>
              {entry.workoutName ?? <span className="font-normal italic text-muted">Not planned yet</span>}
            </div>
          </div>
          {compact.shape === 'workout' && (
            <span
              className={`shrink-0 ${TYPE_LABEL}`}
              data-testid={`my-plan-type-${run.id}`}
            >
              {compact.typePill}
            </span>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="min-w-0 truncate text-sm text-muted">Led by {entry.leader}</div>
          {workout && (
            <div className="flex shrink-0 items-center gap-2">
              <ReactionPicker
                workoutId={workoutVoteId(workout.name, workout.label ?? '')}
                workoutName={workout.name}
                initialVoteData={voteData}
              />
              {workout.flagged ? (
                <span className="flex shrink-0 items-center gap-1.5 border border-ink px-3 py-1.5 text-xs font-bold text-ink">
                  <Flag size={12} />
                  Issue reported
                </span>
              ) : (
                <FlagGhostButton
                  workoutName={workout.name}
                  onClick={() => setFlagDrawerOpen(true)}
                />
              )}
            </div>
          )}
        </div>

        {workout && (
          <WorkoutCardBody
            workout={workout}
            layout={item.run.cardTemplate}
            expanded={expanded}
            onToggle={toggleExpand}
          />
        )}
      </div>

      {workout && flagDrawerOpen && (
        <FlagWorkoutDrawer workout={workout} onClose={() => setFlagDrawerOpen(false)} />
      )}
    </div>
  )
}
