'use client'
import { useState, useTransition } from 'react'
import * as Sentry from '@sentry/nextjs'
import { saveRunProfile, saveRunCycle } from '@/app/run-config/actions'
import { RUN_KINDS, WORKOUT_TYPE_OPTIONS, WEEK_SLOTS, parseSlotValue, joinSlotValue } from '@/lib/runProfile'
import type { RunConfig, RunLeader } from '@/lib/data'

const ORDINALS: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th' }

export default function AboutRunTab({
  runConfig,
  runLeaders,
}: {
  runConfig: RunConfig
  runLeaders: RunLeader[]
}) {
  const [kind, setKind] = useState(runConfig.kind)
  // Drop any stored type outside the current vocabulary up front, so the UI only
  // ever holds values it can render a toggle for (and the server would keep on save).
  const [workoutTypes, setWorkoutTypes] = useState<string[]>(() =>
    runConfig.workoutTypes.filter(t => (WORKOUT_TYPE_OPTIONS as readonly string[]).includes(t))
  )
  // Cycle cadence (#323). Mode is 'none' | 'week_of_month'; slotTypes holds each
  // week slot's selected types as an array for easy toggling — joined with ' or '
  // only when saving. Seed from the stored (possibly compound) slot values.
  const [cycleMode, setCycleMode] = useState(runConfig.cycleMode || 'none')
  const [slotTypes, setSlotTypes] = useState<Record<string, string[]>>(() => {
    const seed: Record<string, string[]> = {}
    for (const slot of WEEK_SLOTS) {
      const key = String(slot)
      seed[key] = parseSlotValue(runConfig.cycle[key] ?? '')
    }
    return seed
  })
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const leaderNames = runLeaders.map(l => l.name).join(', ')
  const isWorkout = kind === 'Workout'

  function toggleType(type: string) {
    setWorkoutTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    )
  }

  function toggleSlotType(slot: string, type: string) {
    setSlotTypes(prev => {
      const current = prev[slot] ?? []
      const next = current.includes(type)
        ? current.filter(t => t !== type)
        : [...current, type]
      return { ...prev, [slot]: next }
    })
  }

  function handleSave() {
    startTransition(async () => {
      try {
        setError('')
        const profileResult = await saveRunProfile({ kind, workoutTypes })
        if (profileResult.error) { setError(profileResult.error); return }

        // Build the slot→type map, keeping only currently-offered types so what we
        // send matches what the server (which validates against the persisted
        // allowlist saved just above) will accept. Non-Workout runs have no cadence.
        const effectiveMode = isWorkout ? cycleMode : 'none'
        const cycle: Record<string, string> = {}
        if (effectiveMode === 'week_of_month') {
          for (const slot of WEEK_SLOTS) {
            const key = String(slot)
            const joined = joinSlotValue((slotTypes[key] ?? []).filter(t => workoutTypes.includes(t)))
            if (joined) cycle[key] = joined
          }
        }
        const cycleResult = await saveRunCycle({ cycleMode: effectiveMode, cycle })
        if (cycleResult.error) { setError(cycleResult.error); return }

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

        {/* Cycle cadence (#323) — only Workout runs schedule a workout-type cadence,
            and its slot choices are the types offered above. */}
        {isWorkout && (
          <div className="flex flex-col gap-3 border-t border-gray-100 pt-4">
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                Workout-type cycle
              </span>
              <p className="text-xs text-gray-500">
                Auto-fills each new week&apos;s workout type when the schedule is generated.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['none', 'None'],
                  ['week_of_month', 'Week of month'],
                ] as const).map(([mode, label]) => {
                  const on = cycleMode === mode
                  return (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setCycleMode(mode)}
                      className={`rounded-lg px-3 py-2 text-sm font-semibold border touch-manipulation ${
                        on
                          ? 'bg-orange-50 border-orange-600 text-orange-700'
                          : 'bg-gray-50 border-gray-200 text-gray-500'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            {cycleMode === 'week_of_month' && (
              <div className="flex flex-col gap-3">
                {workoutTypes.length === 0 && (
                  <p className="text-xs text-gray-500">
                    Turn on some workout types above to assign them to weeks.
                  </p>
                )}
                {WEEK_SLOTS.map(slot => {
                  const key = String(slot)
                  const selected = slotTypes[key] ?? []
                  return (
                    <div key={key} className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-gray-700">
                        {ORDINALS[slot]} {runConfig.dayOfWeek}
                        {slot === 5 && (
                          <span className="font-normal text-gray-400"> (some months)</span>
                        )}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {workoutTypes.map(type => {
                          const on = selected.includes(type)
                          return (
                            <button
                              key={type}
                              type="button"
                              aria-pressed={on}
                              onClick={() => toggleSlotType(key, type)}
                              className={`rounded-full px-3 py-1 text-xs font-semibold border touch-manipulation ${
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
                  )
                })}
              </div>
            )}
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
