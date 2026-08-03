'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import * as Sentry from '@sentry/nextjs'
import { Flag } from 'lucide-react'
import type { Workout } from '@/lib/data'
import { fixWorkoutAndClearFlag, flagWorkoutIssue } from '@/app/actions'
import { workoutVoteId } from '@/lib/votes'

export function FlagBadge({ onClick, size = 22 }: { onClick: (e: React.MouseEvent) => void; size?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Issue reported — view details"
      title="Issue reported"
      style={{ width: size, height: size }}
      className="rounded-full bg-red-500 flex items-center justify-center shadow-sm shrink-0 touch-manipulation"
    >
      <Flag size={Math.round(size * 0.5)} className="text-white" fill="white" strokeWidth={2} />
    </button>
  )
}

export function FlagGhostButton({ workoutName, onClick, dataTour }: { workoutName: string; onClick: (e: React.MouseEvent) => void; dataTour?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Flag an issue with ${workoutName}`}
      title="Flag an issue"
      data-tour={dataTour}
      className="w-7 h-7 flex items-center justify-center rounded-full border border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300 shrink-0 touch-manipulation transition-colors"
    >
      <Flag size={13} />
    </button>
  )
}

// Submit-a-new-flag sheet — mirrors RacesClient's own flag sheet exactly
// (same "what's wrong?" shape, no GitHub issue): DB-only, no audit-trail
// side effect, unlike the pre-#209 FeedbackDrawer this replaces as the entry point.
export function FlagWorkoutDrawer({ workout, onClose }: { workout: Workout; onClose: () => void }) {
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [isPending, startTransition] = useTransition()

  const label = workout.variation ? `${workout.name} — ${workout.variation}` : workout.name

  function submit() {
    setError(undefined)
    startTransition(async () => {
      try {
        const result = await flagWorkoutIssue(workout.name, workout.variation, note)
        if (result && 'error' in result) {
          setError(result.error)
          return
        }
        onClose()
      } catch (err) {
        Sentry.captureException(err, { extra: { workoutName: workout.name, workoutVariation: workout.variation } })
        setError('Something went wrong submitting this — try again in a moment.')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div
        className="w-full bg-white rounded-t-2xl shadow-xl max-h-[85vh] overflow-y-auto flex flex-col px-5 pt-3 pb-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center pb-3">
          <div className="w-9 h-1 rounded-full bg-gray-200" />
        </div>
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Flag an issue</h2>
            <p className="text-sm text-gray-500">{label}</p>
          </div>
          <label className="flex flex-col gap-1.5 text-xs font-bold text-gray-500">
            What&apos;s wrong?
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. the distance is wrong, we usually run 8 reps not 6"
              rows={4}
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 font-normal resize-none"
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2.5">
            <button type="button" onClick={onClose} className="touch-manipulation flex-1 bg-gray-100 text-gray-700 rounded-2xl py-3 font-bold text-sm">
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={isPending}
              className="touch-manipulation flex-1 bg-orange-600 text-white rounded-2xl py-3 font-bold text-sm disabled:opacity-50"
            >
              Submit
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

type Props = {
  workout: Workout
  isLeader: boolean
  onClose: () => void
}

export default function WorkoutFlagSheet({ workout, isLeader, onClose }: Props) {
  const [reason, setReason] = useState(workout.reason)
  const [distTime, setDistTime] = useState(workout.distTime)
  const [instructions, setInstructions] = useState(workout.instructions)
  const [error, setError] = useState<string | undefined>()
  const [isPending, startTransition] = useTransition()

  const label = workout.variation ? `${workout.name} — ${workout.variation}` : workout.name
  const preselect = encodeURIComponent(workoutVoteId(workout.name, workout.variation))

  function submitFix() {
    setError(undefined)
    startTransition(async () => {
      try {
        const result = await fixWorkoutAndClearFlag(workout.name, workout.variation, { reason, distTime, instructions })
        if (result && 'error' in result) {
          setError(result.error)
          return
        }
        onClose()
      } catch (err) {
        Sentry.captureException(err, { extra: { workoutName: workout.name, workoutVariation: workout.variation } })
        setError('Something went wrong saving this — try again in a moment.')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div
        className="w-full bg-white rounded-t-2xl shadow-xl max-h-[85vh] overflow-y-auto flex flex-col px-5 pt-3 pb-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center pb-3">
          <div className="w-9 h-1 rounded-full bg-gray-200" />
        </div>

        {isLeader ? (
          <div className="flex flex-col gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Review &amp; fix</h2>
              <p className="text-sm text-gray-500">{label}</p>
            </div>
            <div className="text-xs text-red-800 bg-red-100 rounded-lg px-3 py-2.5">
              <div className="text-[10.5px] font-bold uppercase tracking-wide opacity-75 mb-0.5">Reported by a runner</div>
              {workout.flagNote}
            </div>
            <label className="flex flex-col gap-1 text-xs font-bold text-gray-500">
              Reason
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 font-normal resize-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold text-gray-500">
              Distance / Time
              <input
                value={distTime}
                onChange={e => setDistTime(e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 font-normal"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold text-gray-500">
              Instructions
              <textarea
                value={instructions}
                onChange={e => setInstructions(e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 font-normal resize-none"
              />
            </label>
            <Link
              href={`/library/edit?name=${encodeURIComponent(workout.name)}&variation=${encodeURIComponent(workout.variation)}`}
              className="text-xs font-bold text-orange-600 touch-manipulation"
            >
              Full edit →
            </Link>
            <Link
              href={`/admin?preselect=${preselect}`}
              className="text-xs font-semibold text-gray-400 hover:text-gray-500 touch-manipulation"
            >
              Actually a duplicate? Combine with another workout →
            </Link>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2.5 mt-1">
              <button
                type="button"
                onClick={onClose}
                className="touch-manipulation flex-1 bg-gray-100 text-gray-700 rounded-2xl py-3 font-bold text-sm"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={submitFix}
                disabled={isPending}
                className="touch-manipulation flex-1 bg-orange-600 text-white rounded-2xl py-3 font-bold text-sm disabled:opacity-50"
              >
                Save fix &amp; clear flag
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Reported issue</h2>
              <p className="text-sm text-gray-500">{label}</p>
            </div>
            <div className="text-sm text-red-800 bg-red-100 rounded-xl px-3.5 py-3">
              <div className="text-[10.5px] font-bold uppercase tracking-wide opacity-75 mb-1">Reported by a runner</div>
              {workout.flagNote}
            </div>
            <p className="text-xs text-gray-400 italic">Only run leaders can edit workout details.</p>
            <button
              type="button"
              onClick={onClose}
              className="touch-manipulation w-full bg-gray-100 text-gray-700 rounded-2xl py-3 font-bold text-sm"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
