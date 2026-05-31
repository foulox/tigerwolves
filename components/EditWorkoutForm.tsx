'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateWorkout } from '@/app/actions'
import { RACE_TYPES, TRAINING_PHASES } from '@/lib/data'
import { FORM_CATEGORIES, FORM_TYPES, chipBase, chipDark, chipOrange, chipOff, toggleItem } from '@/lib/workoutForm'
import type { Workout } from '@/lib/data'
import type { InferredFields } from '@/app/api/workout/infer/route'

type Step = 'entry' | 'loading' | 'review'

export default function EditWorkoutForm({ workout }: { workout: Workout }) {
  const isVariation = !!workout.variation
  const router = useRouter()

  const [step, setStep] = useState<Step>('entry')
  const [name, setName] = useState(workout.name)
  const [category, setCategory] = useState(workout.category)
  const [type, setType] = useState(workout.type)
  const [instructions, setInstructions] = useState(workout.instructions)
  const [reason, setReason] = useState(workout.reason)
  const [route, setRoute] = useState(workout.mapLink ?? '')
  const [variationDesc, setVariationDesc] = useState(workout.variation)
  const [progression, setProgression] = useState(String(workout.progression ?? ''))
  const [review, setReview] = useState<InferredFields | null>(null)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  async function handleEntry(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setStep('loading')
    try {
      const res = await fetch('/api/workout/infer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: isVariation ? workout.name : name,
          category,
          type,
          instructions,
          reason,
        }),
      })
      if (!res.ok) throw new Error('Inference failed')
      const inferred: InferredFields = await res.json()
      setReview(inferred)
      setStep('review')
    } catch (err) {
      setError(`Could not infer fields: ${err instanceof Error ? err.message : String(err)}`)
      setStep('entry')
    }
  }

  function buildFormData() {
    const formData = new FormData()
    formData.set('name', isVariation ? workout.name : name)
    formData.set('category', category)
    formData.set('type', type)
    formData.set('instructions', instructions)
    formData.set('reason', reason)
    formData.set('mapLink', route)
    formData.set('lastRan', workout.lastRan ?? '')
    formData.set('variation', isVariation ? variationDesc : '')
    formData.set('progression', isVariation ? progression : '')
    formData.set('distTime', review!.distTime)
    formData.set('lapStructure', review!.lapStructure)
    formData.set('energySystem', review!.energySystem)
    formData.set('hrZone', review!.hrZone)
    formData.set('rpe', review!.rpe)
    formData.set('raceTypes', review!.raceTypes.join(', '))
    formData.set('trainingPhases', review!.trainingPhases.join(', '))
    formData.set('author', review!.author)
    formData.set('coachingNotes', review!.coachingNotes)
    return formData
  }

  function handleSave() {
    if (!review) return
    setError('')
    startTransition(async () => {
      try {
        await updateWorkout(
          { name: workout.name, variation: workout.variation },
          buildFormData(),
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  if (step === 'loading') {
    return (
      <div className="px-4 pt-10 flex flex-col items-center gap-4 text-center">
        <div className="w-10 h-10 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin mt-8" />
        <p className="text-sm text-gray-500">Analyzing workout...</p>
      </div>
    )
  }

  if (step === 'review' && review) {
    return (
      <div className="px-4 pt-10 pb-10">
        <header className="mb-1">
          <h1 className="text-2xl font-bold text-gray-900">Review & Confirm</h1>
        </header>
        <p className="text-sm text-gray-500 mb-6">Fields refreshed by AI — adjust anything before saving.</p>

        <div className="bg-gray-50 rounded-2xl p-4 mb-6 border border-gray-100">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Workout</p>
          <p className="font-semibold text-gray-900">{isVariation ? workout.name : name}</p>
          <p className="text-xs text-gray-500 mt-0.5">{category} · {type}</p>
          {isVariation && variationDesc && <p className="text-xs text-gray-400 mt-0.5">{variationDesc}</p>}
        </div>

        <Field label="Author / Source">
          <input value={review.author} onChange={e => setReview(r => r && ({ ...r, author: e.target.value }))}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:border-orange-400" />
        </Field>

        <Field label="Distance / Time">
          <input value={review.distTime} onChange={e => setReview(r => r && ({ ...r, distTime: e.target.value }))}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:border-orange-400" />
        </Field>

        <Field label="Lap Structure">
          <input value={review.lapStructure} onChange={e => setReview(r => r && ({ ...r, lapStructure: e.target.value }))}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:border-orange-400"
            placeholder="e.g. 3×10min@tempo r2min jog" />
        </Field>

        <Field label="Energy System">
          <div className="flex flex-wrap gap-2">
            {['Aerobic', 'Lactate Threshold', 'Anaerobic', 'Mixed'].map(s => (
              <button key={s} type="button" onClick={() => setReview(r => r && ({ ...r, energySystem: s }))}
                className={`${chipBase} ${review.energySystem === s ? chipOrange : chipOff}`}>{s}</button>
            ))}
          </div>
        </Field>

        <Field label="HR Zone">
          <div className="flex flex-wrap gap-2">
            {['Z2-Z3', 'Z3-Z4', 'Z4-Z5', 'Z2-Z4', 'Z3-Z5', 'Z2-Z5'].map(z => (
              <button key={z} type="button" onClick={() => setReview(r => r && ({ ...r, hrZone: z }))}
                className={`${chipBase} ${review.hrZone === z ? chipOrange : chipOff}`}>{z}</button>
            ))}
          </div>
        </Field>

        <Field label="RPE">
          <div className="flex gap-2">
            {['5', '6', '7', '8', '9', '10'].map(n => (
              <button key={n} type="button" onClick={() => setReview(r => r && ({ ...r, rpe: n }))}
                className={`${chipBase} ${review.rpe === n ? chipOrange : chipOff}`}>{n}</button>
            ))}
          </div>
        </Field>

        <Field label="Best for race">
          <div className="flex flex-wrap gap-2">
            {RACE_TYPES.map(r => (
              <button key={r} type="button"
                onClick={() => setReview(rv => rv && ({ ...rv, raceTypes: toggleItem(rv.raceTypes, r) }))}
                className={`${chipBase} ${review.raceTypes.includes(r) ? chipDark : chipOff}`}>{r}</button>
            ))}
          </div>
        </Field>

        <Field label="Training phase">
          <div className="flex flex-wrap gap-2">
            {TRAINING_PHASES.map(p => (
              <button key={p} type="button"
                onClick={() => setReview(rv => rv && ({ ...rv, trainingPhases: toggleItem(rv.trainingPhases, p) }))}
                className={`${chipBase} ${review.trainingPhases.includes(p) ? chipDark : chipOff}`}>{p}</button>
            ))}
          </div>
        </Field>

        <Field label="Coach notes">
          <textarea value={review.coachingNotes}
            onChange={e => setReview(r => r && ({ ...r, coachingNotes: e.target.value }))}
            rows={2}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:border-orange-400"
            placeholder="Cues for the leader running this workout" />
        </Field>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <div className="flex gap-3">
          <button type="button" onClick={() => setStep('entry')}
            className="flex-1 py-4 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm touch-manipulation">
            Back
          </button>
          <button type="button" onClick={handleSave} disabled={isPending}
            className="flex-[2] py-4 rounded-xl bg-orange-500 text-white font-semibold text-sm disabled:opacity-40 transition-colors touch-manipulation">
            {isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleEntry} className="px-4 pt-10 pb-10">
      <header className="mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Edit Workout</h1>
      </header>
      <p className="text-sm text-gray-500 mb-6">Update the details — AI will re-infer the rest.</p>

      {isVariation && (
        <div className="bg-gray-50 rounded-2xl p-4 mb-5 border border-gray-100">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Family</p>
          <p className="font-semibold text-gray-900">{workout.name}</p>
          <p className="text-xs text-gray-400 mt-0.5">Parent name — use Regroup to restructure</p>
        </div>
      )}

      {!isVariation && (
        <Field label="Workout Name">
          <input required value={name} onChange={e => setName(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:border-orange-400"
            placeholder="e.g. Hills 10 × 60s" />
        </Field>
      )}

      {isVariation && (
        <>
          <Field label="Variation Description">
            <input value={variationDesc} onChange={e => setVariationDesc(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:border-orange-400"
              placeholder="e.g. 3×2mi@HMP, r3min" />
            <p className="text-xs text-gray-400 mt-1">Short label shown in the family card</p>
          </Field>
          <Field label="Progression (1 = easiest)">
            <input type="number" min="1" value={progression} onChange={e => setProgression(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:border-orange-400" />
          </Field>
        </>
      )}

      <Field label="Category">
        <div className="flex gap-2">
          {FORM_CATEGORIES.map(c => (
            <button type="button" key={c} onClick={() => setCategory(c)}
              className={`${chipBase} ${category === c ? chipDark : chipOff}`}>{c}</button>
          ))}
        </div>
      </Field>

      <Field label="Type">
        <div className="flex flex-wrap gap-2">
          {FORM_TYPES.map(t => (
            <button type="button" key={t} onClick={() => setType(t)}
              className={`${chipBase} ${type === t ? chipOrange : chipOff}`}>{t}</button>
          ))}
        </div>
      </Field>

      <Field label="Instructions">
        <textarea required value={instructions} onChange={e => setInstructions(e.target.value)}
          rows={4}
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:border-orange-400"
          placeholder="WU: 15 min easy. Main: 10×60s@5K, r=jog down. CD: 10 min easy." />
      </Field>

      <Field label="Why this workout?">
        <textarea value={reason} onChange={e => setReason(e.target.value)}
          rows={2}
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:border-orange-400"
          placeholder="Brief description of the purpose" />
      </Field>

      <Field label="Route (optional)">
        <input value={route} onChange={e => setRoute(e.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:border-orange-400"
          placeholder="e.g. strava.com/routes/... or mapmyrun.com/..." />
      </Field>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      <div className="flex gap-3">
        <button type="button" onClick={() => router.back()}
          className="flex-1 py-4 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm touch-manipulation">
          Cancel
        </button>
        <button type="submit" disabled={!category || !type}
          className="flex-[2] py-4 rounded-xl bg-orange-500 text-white font-semibold text-sm disabled:opacity-40 transition-colors touch-manipulation">
          Next →
        </button>
      </div>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <label className="text-sm font-bold text-gray-700 block mb-1.5">{label}</label>
      {children}
    </div>
  )
}
