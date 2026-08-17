'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { regroupFamily } from '@/app/actions'
import type { WorkoutVariantRow } from '@/lib/data'

type Step = 'select' | 'configure'

type WorkoutConfig = {
  workout: WorkoutVariantRow
  label: string
  sortOrder: string
}

// Regroups against workout_variants/workout_families via variant_id (#277) —
// replaces the legacy name||variation keying. data-testid strings still encode
// name||label (not the variantId) since those are the stable, human-readable
// identifiers e2e fixtures already select by; only the actual regroupFamily
// payload moved to variantId.
export default function RegroupWorkoutsForm({ variants }: { variants: WorkoutVariantRow[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [step, setStep] = useState<Step>('select')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<WorkoutVariantRow[]>(() => {
    // #209: a flagged workout's "combine" link routes here pre-selected,
    // so the leader lands ready to pick the second workout to merge with.
    const preselect = searchParams.get('preselect')
    if (!preselect) return []
    const variantId = Number(preselect)
    const match = variants.find(w => w.id === variantId)
    return match ? [match] : []
  })
  const [newName, setNewName] = useState('')
  const [configs, setConfigs] = useState<WorkoutConfig[]>([])
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  // A family is "existing" (triggers the "moving from" warning) only when its
  // familyId has more than one variant row — same rule LibraryClient/PlanClient
  // use, so a lone variant with a non-null label doesn't falsely warn.
  const familyIds = new Set<number>()
  const counts = new Map<number, number>()
  for (const w of variants) counts.set(w.familyId, (counts.get(w.familyId) ?? 0) + 1)
  for (const [id, count] of counts) if (count > 1) familyIds.add(id)

  const q = search.toLowerCase()
  const filtered = variants.filter(w =>
    !q ||
    w.name.toLowerCase().includes(q) ||
    w.type.toLowerCase().includes(q) ||
    (w.label ?? '').toLowerCase().includes(q)
  )

  function toggleSelect(w: WorkoutVariantRow) {
    setSelected(prev => {
      const exists = prev.some(s => s.id === w.id)
      return exists ? prev.filter(s => s.id !== w.id) : [...prev, w]
    })
  }

  function isSelected(w: WorkoutVariantRow) {
    return selected.some(s => s.id === w.id)
  }

  function goToConfigure() {
    setConfigs(selected.map((w, i) => ({ workout: w, label: '', sortOrder: String(i + 1) })))
    setNewName('')
    setError('')
    setStep('configure')
  }

  function updateConfig(index: number, field: 'label' | 'sortOrder', value: string) {
    setConfigs(prev => prev.map((c, i) => i === index ? { ...c, [field]: value } : c))
  }

  function handleSave() {
    if (!newName.trim()) { setError('Family name is required.'); return }
    const missing = configs.find(c => !c.label.trim())
    if (missing) { setError('All workouts need a variation description.'); return }
    setError('')
    startTransition(async () => {
      try {
        await regroupFamily(
          newName.trim(),
          configs.map(c => ({
            variantId: c.workout.id,
            label: c.label.trim(),
            sortOrder: parseInt(c.sortOrder, 10) || 1,
          }))
        )
      } catch (err) {
        if (isRedirectError(err)) throw err
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  if (step === 'configure') {
    const warnings = configs.filter(c => familyIds.has(c.workout.familyId))

    return (
      <>
      <div className="px-4 pb-44">
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
            data-testid="regroup-family-name"
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:border-orange-400"
            placeholder="e.g. K Bridge Hills"
          />
        </div>

        {warnings.length > 0 && (
          <div className="mb-5 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-xs font-bold text-amber-700 mb-1">Moving from existing {warnings.length === 1 ? 'family' : 'families'}</p>
            {warnings.map(c => (
              <p key={c.workout.id} className="text-xs text-amber-600">
                &ldquo;{c.workout.label || c.workout.name}&rdquo; will be removed from the <span className="font-semibold">{c.workout.name}</span> family
              </p>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-4 mb-6">
          {configs.map((c, i) => (
            <div key={c.workout.id} className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{c.workout.name}</p>
                  {c.workout.label && (
                    <p className="text-xs text-gray-400 mt-0.5">{c.workout.label}</p>
                  )}
                </div>
                <span className="text-xs font-semibold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full shrink-0">{c.workout.type}</span>
              </div>

              <div className="mb-3">
                <label className="text-xs font-bold text-gray-600 block mb-1">
                  What&apos;s different? <span className="text-orange-500">*</span>
                </label>
                <input
                  value={c.label}
                  onChange={e => updateConfig(i, 'label', e.target.value)}
                  data-testid={`regroup-variation-input-${i}`}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                  placeholder="e.g. Shorter reps, higher volume"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Sort order (1 = easiest)</label>
                <input
                  type="number"
                  min="1"
                  value={c.sortOrder}
                  onChange={e => updateConfig(i, 'sortOrder', e.target.value)}
                  className="w-24 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                />
              </div>
            </div>
          ))}
        </div>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
      </div>

      <div className="fixed bottom-20 left-0 right-0 bg-white border-t border-gray-100 px-4 py-4 flex gap-3">
        <button type="button" onClick={() => setStep('select')}
          className="flex-1 py-4 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm touch-manipulation">
          Back
        </button>
        <button type="button" onClick={handleSave} disabled={isPending}
          data-testid="regroup-save"
          className="flex-[2] py-4 rounded-xl bg-orange-500 text-white font-semibold text-sm disabled:opacity-40 transition-colors touch-manipulation">
          {isPending ? 'Saving...' : `Create Family (${configs.length})`}
        </button>
      </div>
      </>
    )
  }

  return (
    <div className="px-4 pb-44">
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
          const inFamily = familyIds.has(w.familyId)
          const sel = isSelected(w)
          return (
            <button
              key={w.id}
              type="button"
              data-testid={`regroup-option-${w.name}||${w.label ?? ''}`}
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
                  {w.label && <p className="text-xs text-gray-400 mt-0.5 truncate">{w.label}</p>}
                  {inFamily && !w.label && (
                    <p className="text-xs text-amber-500 mt-0.5">Base of family</p>
                  )}
                  {inFamily && w.label && (
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

      <div className="fixed bottom-20 left-0 right-0 bg-white border-t border-gray-100 px-4 py-4 flex gap-3">
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
