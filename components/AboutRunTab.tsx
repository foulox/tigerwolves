'use client'
import { useState, useTransition } from 'react'
import * as Sentry from '@sentry/nextjs'
import { saveRunProfile } from '@/app/run-config/actions'
import { RUN_KINDS, WORKOUT_TYPE_OPTIONS } from '@/lib/runProfile'
import type { RunConfig, RunLeader } from '@/lib/data'

export default function AboutRunTab({
  runConfig,
  runLeaders,
}: {
  runConfig: RunConfig
  runLeaders: RunLeader[]
}) {
  const [kind, setKind] = useState(runConfig.kind)
  const [workoutTypes, setWorkoutTypes] = useState<string[]>(runConfig.workoutTypes)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const leaderNames = runLeaders.map(l => l.name).join(', ')

  function toggleType(type: string) {
    setWorkoutTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    )
  }

  function handleSave() {
    startTransition(async () => {
      try {
        setError('')
        const result = await saveRunProfile({ kind, workoutTypes })
        if (result.error) { setError(result.error); return }
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } catch (err) {
        Sentry.captureException(err)
        setError('Something went wrong')
      }
    })
  }

  const summaryRow = (label: string, value: string) => (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{label}</span>
      <span className="text-sm text-gray-900">{value || '—'}</span>
    </div>
  )

  return (
    <div className="p-4 flex flex-col gap-4">
      {/* At a glance — read-only. Editing name/day/leaders is out of scope (#321);
          leaders are managed in the Roster tab. */}
      <div className="bg-white rounded-xl p-4 flex flex-col gap-3 shadow-sm">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide">At a glance</h2>
        {summaryRow('Run', runConfig.name)}
        {summaryRow('Day', runConfig.dayOfWeek)}
        {summaryRow('Leaders', leaderNames)}
      </div>

      <div className="bg-white rounded-xl p-4 flex flex-col gap-4 shadow-sm">
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
            {/* Placeholder shown only until a kind is chosen (runs.kind may start empty). */}
            {!(RUN_KINDS as readonly string[]).includes(kind) && (
              <option value="" disabled>Select a kind…</option>
            )}
            {RUN_KINDS.map(k => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </div>

        {kind === 'Workout' && (
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
          onClick={handleSave}
          disabled={isPending}
          className="bg-orange-600 text-white rounded-xl py-3 font-bold text-sm disabled:opacity-50 touch-manipulation"
        >
          {saved ? 'Saved!' : isPending ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}
