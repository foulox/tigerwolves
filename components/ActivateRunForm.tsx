'use client'
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import * as Sentry from '@sentry/nextjs'
import { RUN_KINDS, WORKOUT_TYPE_OPTIONS } from '@/lib/runProfile'
import type { RunIdentityValues } from '@/lib/runIdentity'
import type { NBRRun } from '@/lib/allRunsData'
import { nbrRunToIdentity } from '@/lib/allRunsData'
import { activateNbrRun } from '@/app/admin/actions'
import RunIdentityFields from '@/components/RunIdentityFields'

const EMPTY_IDENTITY: RunIdentityValues = {
  name: '',
  dayOfWeek: 'Monday',
  emoji: '',
  meetingTime: '',
  meetingLocation: '',
  description: '',
  warmupDescription: '',
}

export default function ActivateRunForm({ runs }: { runs: NBRRun[] }): React.JSX.Element {
  const router = useRouter()
  const [selectedRun, setSelectedRun] = useState<NBRRun | null>(null)
  const [identity, setIdentity] = useState<RunIdentityValues>(EMPTY_IDENTITY)
  const [kind, setKind] = useState('')
  const [workoutTypes, setWorkoutTypes] = useState<string[]>([])
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isWorkout = kind === 'Workout'

  function handlePickerChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value
    const run = runs.find(r => r.id === id) ?? null
    setSelectedRun(run)
    setError('')
    if (run) {
      const prefill = nbrRunToIdentity(run)
      setIdentity(prefill.identity)
      setKind(prefill.kind)
      setWorkoutTypes([])
    } else {
      setIdentity(EMPTY_IDENTITY)
      setKind('')
      setWorkoutTypes([])
    }
  }

  // Duplicated verbatim from CreateRunForm (intentional per grooming decision #5)
  function toggleType(type: string) {
    setWorkoutTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    )
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!selectedRun) return
    setIsSubmitting(true)
    setError('')
    try {
      const result = await activateNbrRun({ nbrId: selectedRun.id, identity, kind, workoutTypes })
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

  if (runs.length === 0) {
    return (
      <p className="text-sm text-gray-500 px-4 py-8 text-center">
        All NBR directory runs have been activated.
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-4">
      {/* NBR run picker */}
      <div className="bg-white rounded-xl p-4 flex flex-col gap-3 shadow-sm">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide">NBR directory run</h2>
        <div className="flex flex-col gap-1">
          <label htmlFor="nbr-run-picker" className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
            Choose a run
          </label>
          <select
            id="nbr-run-picker"
            value={selectedRun?.id ?? ''}
            onChange={handlePickerChange}
            className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 touch-manipulation"
          >
            <option value="" disabled>Choose a run…</option>
            {runs.map(r => (
              <option key={r.id} value={r.id}>
                {r.name} — {r.day.charAt(0).toUpperCase() + r.day.slice(1)} {r.startTime}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Identity fields — only shown once a run is selected */}
      {selectedRun && (
        <div className="bg-white rounded-xl p-4 flex flex-col gap-3 shadow-sm">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Run details</h2>
          <RunIdentityFields
            values={identity}
            onChange={patch => setIdentity(prev => ({ ...prev, ...patch }))}
          />
        </div>
      )}

      {/* Kind + workout types — only shown once a run is selected */}
      {selectedRun && (
        <div className="bg-white rounded-xl p-4 flex flex-col gap-4 shadow-sm">
          {/* Kind select — duplicated presentational block from CreateRunForm */}
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

          {/* Workout-type toggle grid — duplicated presentational block from CreateRunForm */}
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
            disabled={!selectedRun || isSubmitting}
            className="bg-orange-600 text-white rounded-xl py-3 font-bold text-sm disabled:opacity-50 touch-manipulation"
          >
            {isSubmitting ? 'Activating…' : 'Activate run'}
          </button>
        </div>
      )}

      {/* Error shown before a run is selected (e.g. if form submitted while picker is selected but kind/identity section is hidden — guard only) */}
      {!selectedRun && error && <p className="text-sm text-red-600 px-1">{error}</p>}
    </form>
  )
}
