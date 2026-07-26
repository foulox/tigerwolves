'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { ScheduleEntry, Workout } from '@/lib/data'
import { formatDateMedium } from '@/lib/postBuilder'
import { workoutVoteId } from '@/lib/votes'
import type { VoteData } from '@/lib/votes'
import ReactionPicker from '@/components/ReactionPicker'
import FeedbackDrawer from '@/components/FeedbackDrawer'
import { captureClientEvent } from '@/lib/analyticsClient'

const TYPE_COLORS: Record<string, string> = {
  Hills: 'bg-green-100 text-green-800',
  'Broken Tempo': 'bg-blue-100 text-blue-800',
  Progression: 'bg-purple-100 text-purple-800',
  Ladder: 'bg-orange-100 text-orange-800',
  Superset: 'bg-red-100 text-red-800',
  'Straight Tempo': 'bg-yellow-100 text-yellow-800',
  Threshold: 'bg-pink-100 text-pink-800',
}

interface Props {
  entry: ScheduleEntry
  workout: Workout | null
  index: number
  isLeader: boolean
  voteData?: VoteData | null
  isPast?: boolean
}

export default function ScheduleCard({ entry, workout, index, isLeader, voteData, isPast = false }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const isNext = !isPast && index === 0
  const hasWorkout = workout !== null
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
        isPast ? 'bg-[#f8f8f9] border-[#e2e4e7]' : isNext ? 'bg-white border-orange-300' : 'bg-white border-gray-100'
      }`}
    >
      {/* Card header — interactive when workout exists */}
      <div
        role={hasWorkout ? 'button' : undefined}
        tabIndex={hasWorkout ? 0 : undefined}
        aria-expanded={hasWorkout ? expanded : undefined}
        className={`p-4 ${hasWorkout ? 'cursor-pointer active:bg-gray-50' : ''}`}
        onClick={toggleExpand}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand() } }}
        data-testid={cardTestId}
        data-tour={isNext ? 'schedule-detail' : undefined}
      >
        {isNext && <div className="text-xs font-bold text-orange-500 tracking-wide mb-1">NEXT UP</div>}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className={`text-sm font-semibold ${isPast ? 'text-gray-400' : 'text-gray-500'}`}>{formatDateMedium(entry.date)}</div>
            <div className={`mt-0.5 truncate ${isPast ? 'text-sm font-semibold text-[#8b8f97]' : 'text-base font-bold text-gray-900'}`}>
              {entry.workoutName ?? <span className="text-gray-400 font-normal italic">Not planned yet</span>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <span
              className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${
                isPast ? 'bg-[#e9eaec] text-[#9ca3af]' : (TYPE_COLORS[entry.workoutType] ?? 'bg-gray-100 text-gray-600')
              }`}
            >
              {entry.workoutType}
            </span>
            {isLeader && isPast && hasWorkout && (
              <Link
                href={`/library/edit?name=${encodeURIComponent(workout.name)}&variation=${encodeURIComponent(workout.variation)}`}
                className="text-xs font-semibold text-gray-500 border border-gray-300 rounded-full px-3 py-1 bg-white active:bg-gray-50 touch-manipulation whitespace-nowrap"
                onClick={(e) => e.stopPropagation()}
                data-testid={`edit-in-library-${index}`}
              >
                Edit in library →
              </Link>
            )}
            {isLeader && !isPast && (
              <Link
                href={`/plan?week=${index}`}
                className="text-xs font-semibold text-orange-600 border border-orange-300 rounded-full px-3 py-1 active:bg-orange-50 touch-manipulation whitespace-nowrap"
                onClick={(e) => e.stopPropagation()}
                data-testid={`plan-week-${index}`}
              >
                Plan week →
              </Link>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 mt-2">
          <div className={`text-sm min-w-0 truncate ${isPast ? 'text-[#a3a7ad]' : 'text-gray-500'}`}>Led by {entry.leader}</div>
          {workout && (
            <div className="shrink-0" onClick={(e) => e.stopPropagation()} data-tour={isNext ? 'schedule-reactions' : undefined}>
              <ReactionPicker
                workoutId={workoutVoteId(workout.name, workout.variation)}
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
        <div className="border-t border-gray-100 px-4 py-3 space-y-2 text-sm" data-testid={detailTestId}>
          {workout.reason && <DetailRow label="Reason" value={workout.reason} />}
          {workout.distTime && <DetailRow label="Distance / Time" value={workout.distTime} />}
          {workout.instructions && <DetailRow label="Instructions" value={workout.instructions} />}
          {workout.lapStructure && <DetailRow label="Lap Structure" value={workout.lapStructure} />}
          {workout.energySystem && <DetailRow label="Energy System" value={workout.energySystem} />}
          {(workout.hrZone || workout.rpe) && (
            <div className="flex gap-4">
              {workout.hrZone && <DetailRow label="HR Zone" value={workout.hrZone} />}
              {workout.rpe && <DetailRow label="RPE" value={workout.rpe} />}
            </div>
          )}
          {workout.trainingPhases.length > 0 && (
            <ChipRow label="Training Phases" chips={workout.trainingPhases} />
          )}
          {workout.raceTypes.length > 0 && (
            <ChipRow label="Race Types" chips={workout.raceTypes} />
          )}
          {workout.author && <DetailRow label="Author" value={workout.author} />}
          {filteredVariations.length > 0 && (
            <ChipRow label="Variations" chips={filteredVariations} />
          )}
          <ReactionPicker
            workoutId={workoutVoteId(workout.name, workout.variation)}
            workoutName={workout.name}
            initialVoteData={voteData ?? null}
            muted={isPast}
          />
          <button
            onClick={e => { e.stopPropagation(); setFeedbackOpen(true) }}
            data-tour={isNext ? 'schedule-flag' : undefined}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-full border border-dashed border-gray-300 text-xs text-gray-400 hover:text-gray-600 hover:border-gray-400 touch-manipulation transition-colors"
          >
            🚩 Flag an issue with this workout
          </button>
        </div>
      )}
      {/* FeedbackDrawer lives outside the expanded block so feedbackOpen state
          doesn't persist across collapse/re-expand cycles */}
      {workout && (
        <FeedbackDrawer
          open={feedbackOpen}
          onClose={() => setFeedbackOpen(false)}
          defaultType="workout-data"
          workoutContext={`${workout.name} (${entry.workoutType}) — ${formatDateMedium(entry.date)}`}
        />
      )}
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="font-semibold text-gray-700">{label}: </span>
      <span className="text-gray-600">{value}</span>
    </div>
  )
}

function ChipRow({ label, chips }: { label: string; chips: string[] }) {
  return (
    <div>
      <div className="font-semibold text-gray-700 mb-1">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {chips.map(chip => (
          <span key={chip} className="text-xs bg-gray-100 text-gray-700 rounded-full px-2.5 py-0.5">{chip}</span>
        ))}
      </div>
    </div>
  )
}
