'use client'
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import * as Sentry from '@sentry/nextjs'
import { RUN_KINDS, WORKOUT_TYPE_OPTIONS } from '@/lib/runProfile'
import type { RunIdentityValues } from '@/lib/runIdentity'
import { createRun } from '@/app/admin/actions'
import RunIdentityFields from '@/components/RunIdentityFields'

const EMPTY_IDENTITY: RunIdentityValues = {
  name: '',
  dayOfWeek: 'Monday',
  emoji: '',
  meetingTime: '',
  meetingLocation: '',
  description: '',
}

export default function CreateRunForm(): React.JSX.Element {
  const router = useRouter()
  const [identity, setIdentity] = useState<RunIdentityValues>(EMPTY_IDENTITY)
  const [kind, setKind] = useState('')
  const [workoutTypes, setWorkoutTypes] = useState<string[]>([])
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isWorkout = kind === 'Workout'

  // Duplicated verbatim from AboutRunTab (intentional per grooming decision #5)
  function toggleType(type: string) {
    setWorkoutTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    )
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsSubmitting(true)
    setError('')
    try {
      const result = await createRun({ identity, kind, workoutTypes })
      if (result.runId) {
        router.push('/runs/' + result.runId)
      } else if (result.error) {
        setError(result.error)
      }
    } catch (err) {
      Sentry.captureException(err)
      setError('Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-4">
      {/* Identity fields */}
      <div className="bg-white rounded-xl p-4 flex flex-col gap-3 shadow-sm">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Run details</h2>
        <RunIdentityFields
          values={identity}
          onChange={patch => setIdentity(prev => ({ ...prev, ...patch }))}
        />
      </div>

      {/* Kind + workout types */}
      <div className="bg-white rounded-xl p-4 flex flex-col gap-4 shadow-sm">
        {/* Kind select — duplicated presentational block from AboutRunTab */}
        <div className="flex flex-col gap-1">
          <label htmlFor="run-kind" className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
            Kind of run
          </label>
          <select
            id="run-kind"
            value={kind}
            onChange={e => setKind(e.target.value)}
            className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 touch-manipulation"
          >
            {/* Placeholder shown only until a kind is chosen */}
            {!(RUN_KINDS as readonly string[]).includes(kind) && (
              <option value="" disabled>Select a kind…</option>
            )}
            {RUN_KINDS.map(k => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </div>

        {/* Workout-type toggle grid — duplicated presentational block from AboutRunTab */}
        {isWorkout && (
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
              Workout types offered
            </span>
            <div className="grid grid-cols-2 gap-2">
              {WORKOUT_TYPE_OPTIONS.map(type => {
                const on = workoutTypes.includes(type)
                return (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleType(type)}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold border touch-manipulation ${
                      on
                        ? 'bg-orange-50 border-orange-600 text-orange-700'
                        : 'bg-gray-50 border-gray-200 text-gray-500'
                    }`}
                  >
                    {type}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-orange-600 text-white rounded-xl py-3 font-bold text-sm disabled:opacity-50 touch-manipulation"
        >
          {isSubmitting ? 'Creating…' : 'Create run'}
        </button>
      </div>
    </form>
  )
}
