'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { regroupFamily } from '@/app/actions'
import type { Workout } from '@/lib/data'

type Step = 'select' | 'configure'

type WorkoutConfig = {
  workout: Workout
  variation: string
  progression: string
}

export default function RegroupWorkoutsForm({ workouts }: { workouts: Workout[] }) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('select')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Workout[]>([])
  const [newName, setNewName] = useState('')
  const [configs, setConfigs] = useState<WorkoutConfig[]>([])
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const familyNames = new Set(workouts.filter(w => w.variation).map(w => w.name))

  const q = search.toLowerCase()
  const filtered = workouts.filter(w =>
    !q ||
    w.name.toLowerCase().includes(q) ||
    w.type.toLowerCase().includes(q) ||
    w.variation.toLowerCase().includes(q)
  )

  function toggleSelect(w: Workout) {
    setSelected(prev => {
      const key = `${w.name}||${w.variation}`
      const exists = prev.some(s => `${s.name}||${s.variation}` === key)
      return exists ? prev.filter(s => `${s.name}||${s.variation}` !== key) : [...prev, w]
    })
  }

  function isSelected(w: Workout) {
    return selected.some(s => s.name === w.name && s.variation === w.variation)
  }

  function goToConfigure() {
    setConfigs(selected.map((w, i) => ({ workout: w, variation: '', progression: String(i + 1) })))
    setNewName('')
    setError('')
    setStep('configure')
  }

  function updateConfig(index: number, field: 'variation' | 'progression', value: string) {
    setConfigs(prev => prev.map((c, i) => i === index ? { ...c, [field]: value } : c))
  }

  function handleSave() {
    if (!newName.trim()) { setError('Family name is required.'); return }
    const missing = configs.find(c => !c.variation.trim())
    if (missing) { setError('All workouts need a variation description.'); return }
    setError('')
    startTransition(async () => {
      try {
        await regroupFamily(
          newName.trim(),
          configs.map(c => ({
            originalName: c.workout.name,
            originalVariation: c.workout.variation,
            variation: c.variation.trim(),
            progression: parseInt(c.progression, 10) || 1,
          }))
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  if (step === 'configure') {
    const warnings = configs.filter(c => familyNames.has(c.workout.name))

    return (
      <div className="px-4 pt-10 pb-10">
        <header className="mb-2">
          <h1 className="text-2xl font-bold text-gray-900">Configure Family</h1>
        </header>
        <p className="text-sm text-gray-500 mb-6">Set a shared parent name and describe each variation.</p>

        <div className="mb-5">
          <label className="text-sm font-bold text-gray-700 block mb-1.5">
            Family Name <span className="text-orange-500">*</span>
          </label>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:border-orange-400"
            placeholder="e.g. K Bridge Hills"
          />
        </div>

        {warnings.length > 0 && (
          <div className="mb-5 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-xs font-bold text-amber-700 mb-1">Moving from existing {warnings.length === 1 ? 'family' : 'families'}</p>
            {warnings.map(c => (
              <p key={`${c.workout.name}||${c.workout.variation}`} className="text-xs text-amber-600">
                &ldquo;{c.workout.variation || c.workout.name}&rdquo; will be removed from the <span className="font-semibold">{c.workout.name}</span> family
              </p>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-4 mb-6">
          {configs.map((c, i) => (
            <div key={`${c.workout.name}||${c.workout.variation}`} className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{c.workout.name}</p>
                  {c.workout.variation && (
                    <p className="text-xs text-gray-400 mt-0.5">{c.workout.variation}</p>
                  )}
                </div>
                <span className="text-xs font-semibold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full shrink-0">{c.workout.type}</span>
              </div>

              <div className="mb-3">
                <label className="text-xs font-bold text-gray-600 block mb-1">
                  What&apos;s different? <span className="text-orange-500">*</span>
                </label>
                <input
                  value={c.variation}
                  onChange={e => updateConfig(i, 'variation', e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                  placeholder="e.g. Shorter reps, higher volume"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Progression (1 = easiest)</label>
                <input
                  type="number"
                  min="1"
                  value={c.progression}
                  onChange={e => updateConfig(i, 'progression', e.target.value)}
                  className="w-24 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                />
              </div>
            </div>
          ))}
        </div>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <div className="flex gap-3">
          <button type="button" onClick={() => setStep('select')}
            className="flex-1 py-4 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm touch-manipulation">
            Back
          </button>
          <button type="button" onClick={handleSave} disabled={isPending}
            className="flex-[2] py-4 rounded-xl bg-orange-500 text-white font-semibold text-sm disabled:opacity-40 transition-colors touch-manipulation">
            {isPending ? 'Saving...' : `Create Family (${configs.length})`}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 pt-10 pb-10">
      <header className="mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Regroup Workouts</h1>
      </header>
      <p className="text-sm text-gray-500 mb-5">Select 2 or more workouts to combine into a family.</p>

      <div className="relative mb-4">
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or type…"
          className="w-full rounded-xl border border-gray-200 bg-white pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-orange-400"
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
      </div>

      {selected.length > 0 && (
        <div className="mb-3 px-3 py-2 bg-orange-50 border border-orange-200 rounded-xl flex justify-between items-center">
          <span className="text-xs font-semibold text-orange-700">{selected.length} selected</span>
          <button onClick={() => setSelected([])} className="text-xs text-orange-500 touch-manipulation">Clear</button>
        </div>
      )}

      <div className="flex flex-col gap-2 mb-6">
        {filtered.map(w => {
          const inFamily = familyNames.has(w.name)
          const sel = isSelected(w)
          return (
            <button
              key={`${w.name}||${w.variation}`}
              type="button"
              onClick={() => toggleSelect(w)}
              className={`text-left rounded-xl px-4 py-3 border transition-colors touch-manipulation ${
                sel
                  ? 'bg-orange-50 border-orange-300'
                  : 'bg-white border-gray-100'
              }`}
            >
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 text-sm truncate">{w.name}</p>
                  {w.variation && <p className="text-xs text-gray-400 mt-0.5 truncate">{w.variation}</p>}
                  {inFamily && !w.variation && (
                    <p className="text-xs text-amber-500 mt-0.5">Base of family</p>
                  )}
                  {inFamily && w.variation && (
                    <p className="text-xs text-amber-500 mt-0.5">In: {w.name} family</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-semibold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{w.type}</span>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    sel ? 'bg-orange-500 border-orange-500' : 'border-gray-300'
                  }`}>
                    {sel && <span className="text-white text-xs font-bold">✓</span>}
                  </div>
                </div>
              </div>
            </button>
          )
        })}
        {filtered.length === 0 && (
          <p className="text-gray-400 italic text-sm">No workouts match your search.</p>
        )}
      </div>

      <div className="flex gap-3">
        <button type="button" onClick={() => router.back()}
          className="flex-1 py-4 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm touch-manipulation">
          Cancel
        </button>
        <button type="button" onClick={goToConfigure} disabled={selected.length < 2}
          className="flex-[2] py-4 rounded-xl bg-orange-500 text-white font-semibold text-sm disabled:opacity-40 transition-colors touch-manipulation">
          Configure → ({selected.length} selected)
        </button>
      </div>
    </div>
  )
}
