'use client'

import { useState, useTransition } from 'react'
import { updateWorkout } from '@/app/actions'
import { computeTurnaround } from '@/lib/postBuilder'
import { RACE_TYPES, TRAINING_PHASES } from '@/lib/data'
import { FORM_CATEGORIES, FORM_TYPES, chipBase, chipDark, chipOrange, chipOff, toggleItem } from '@/lib/workoutForm'
import type { Workout } from '@/lib/data'
import type { InferredFields } from '@/app/api/workout/infer/route'

type Step = 'entry' | 'loading' | 'review'

export default function EditWorkoutForm({ workout }: { workout: Workout }) {
  const original = {
    name: workout.name,
    variation: workout.variation,
    hasTurnaround: workout.hasTurnaround,
    turnaroundDistance: workout.turnaroundDistance,
  }

  const [step, setStep] = useState<Step>('entry')
  const [entry, setEntry] = useState({
    name: workout.name,
    category: workout.category,
    type: workout.type,
    instructions: workout.instructions,
    reason: workout.reason,
    route: workout.mapLink ?? '',
    variation: workout.variation,
    progression: workout.progression != null ? String(workout.progression) : '',
  })
  const [review, setReview] = useState<InferredFields>({
    distTime: workout.distTime,
    lapStructure: workout.lapStructure,
    energySystem: workout.energySystem,
    hrZone: workout.hrZone,
    rpe: workout.rpe,
    raceTypes: workout.raceTypes,
    trainingPhases: workout.trainingPhases,
    author: workout.author ?? '',
    coachingNotes: workout.coachingNotes ?? '',
  })
  const [hasTurnaround, setHasTurnaround] = useState(workout.hasTurnaround)
  const [turnaroundDistance, setTurnaroundDistance] = useState(workout.turnaroundDistance)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  async function handleEntry(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setStep('loading')
    try {
      const res = await fetch('/api/workout/infer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      })
      if (!res.ok) throw new Error('Inference failed')
      const inferred: InferredFields = await res.json()
      setReview(inferred)
      if (hasTurnaround && !turnaroundDistance) {
        const computed = computeTurnaround(entry.instructions)
        const prefix = '↩️ TURN AROUND: '
        const desc = computed.startsWith(prefix) ? computed.slice(prefix.length) : ''
        if (desc && desc !== '[add before posting]') setTurnaroundDistance(desc)
      }
      setStep('review')
    } catch (err) {
      setError(`Could not infer fields: ${err instanceof Error ? err.message : String(err)}`)
      setStep('entry')
    }
  }

  function buildFormData() {
    const formData = new FormData()
    formData.set('name', entry.name)
    formData.set('category', entry.category)
    formData.set('type', entry.type)
    formData.set('instructions', entry.instructions)
    formData.set('reason', entry.reason)
    formData.set('mapLink', entry.route)
    formData.set('variation', entry.variation)
    formData.set('progression', entry.progression)
    formData.set('distTime', review.distTime)
    formData.set('lapStructure', review.lapStructure)
    formData.set('energySystem', review.energySystem)
    formData.set('hrZone', review.hrZone)
    formData.set('rpe', review.rpe)
    formData.set('raceTypes', review.raceTypes.join(', '))
    formData.set('trainingPhases', review.trainingPhases.join(', '))
    formData.set('author', review.author)
    formData.set('coachingNotes', review.coachingNotes)
    formData.set('hasTurnaround', String(hasTurnaround))
    formData.set('turnaroundDistance', turnaroundDistance)
    return formData
  }

  function handleSave() {
    setError('')
    startTransition(async () => {
      try {
        await updateWorkout(original, buildFormData())
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  if (step === 'loading') {
    return (
      <div className="px-4 pt-10 flex flex-col items-center gap-4 text-center">
        <div className="w-10 h-10 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin mt-8" />
        <p className="text-sm text-gray-500">Re-analyzing workout...</p>
      </div>
    )
  }

  if (step === 'review') {
    return (
      <div className="px-4 pt-10 pb-10">
        <header className="mb-1">
          <h1 className="text-2xl font-bold text-gray-900">Review & Save</h1>
        </header>
        <p className="text-sm text-gray-500 mb-6">Fields re-inferred by AI — adjust anything before saving.</p>

        <div className="bg-gray-50 rounded-2xl p-4 mb-6 border border-gray-100">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Workout</p>
          <p className="font-semibold text-gray-900">{entry.name}</p>
          <p className="text-xs text-gray-500 mt-0.5">{entry.category} · {entry.type}</p>
        </div>

        <Field label="Author / Source">
          <input value={review.author} onChange={e => setReview(r => ({ ...r, author: e.target.value }))}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:border-orange-400" />
        </Field>

        <Field label="Distance / Time">
          <input value={review.distTime} onChange={e => setReview(r => ({ ...r, distTime: e.target.value }))}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:border-orange-400" />
        </Field>

        <Field label="Lap Structure">
          <input value={review.lapStructure} onChange={e => setReview(r => ({ ...r, lapStructure: e.target.value }))}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:border-orange-400"
            placeholder="e.g. 3×10min@tempo r2min jog" />
        </Field>

        <Field label="Energy System">
          <div className="flex flex-wrap gap-2">
            {['Aerobic', 'Lactate Threshold', 'Anaerobic', 'Mixed'].map(s => (
              <button key={s} type="button" onClick={() => setReview(r => ({ ...r, energySystem: s }))}
                className={`${chipBase} ${review.energySystem === s ? chipOrange : chipOff}`}>{s}</button>
            ))}
          </div>
        </Field>

        <Field label="HR Zone">
          <div className="flex flex-wrap gap-2">
            {['Z2-Z3', 'Z3-Z4', 'Z4-Z5', 'Z2-Z4', 'Z3-Z5', 'Z2-Z5'].map(z => (
              <button key={z} type="button" onClick={() => setReview(r => ({ ...r, hrZone: z }))}
                className={`${chipBase} ${review.hrZone === z ? chipOrange : chipOff}`}>{z}</button>
            ))}
          </div>
        </Field>

        <Field label="RPE">
          <div className="flex gap-2">
            {['5', '6', '7', '8', '9', '10'].map(n => (
              <button key={n} type="button" onClick={() => setReview(r => ({ ...r, rpe: n }))}
                className={`${chipBase} ${review.rpe === n ? chipOrange : chipOff}`}>{n}</button>
            ))}
          </div>
        </Field>

        <Field label="Best for race">
          <div className="flex flex-wrap gap-2">
            {RACE_TYPES.map(r => (
              <button key={r} type="button"
                onClick={() => setReview(rv => ({ ...rv, raceTypes: toggleItem(rv.raceTypes, r) }))}
                className={`${chipBase} ${review.raceTypes.includes(r) ? chipDark : chipOff}`}>{r}</button>
            ))}
          </div>
        </Field>

        <Field label="Training phase">
          <div className="flex flex-wrap gap-2">
            {TRAINING_PHASES.map(p => (
              <button key={p} type="button"
                onClick={() => setReview(rv => ({ ...rv, trainingPhases: toggleItem(rv.trainingPhases, p) }))}
                className={`${chipBase} ${review.trainingPhases.includes(p) ? chipDark : chipOff}`}>{p}</button>
            ))}
          </div>
        </Field>

        <Field label="Coach notes">
          <textarea value={review.coachingNotes}
            onChange={e => setReview(r => ({ ...r, coachingNotes: e.target.value }))}
            rows={2}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:border-orange-400"
            placeholder="Cues for the leader running this workout" />
        </Field>

        {hasTurnaround && (
          <Field label="Turnaround point">
            <input value={turnaroundDistance} onChange={e => setTurnaroundDistance(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:border-orange-400"
              placeholder="e.g. After the 3rd rep of 4×5min" />
          </Field>
        )}

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
      <p className="text-sm text-gray-500 mb-6">Update the basics — AI will re-suggest the rest.</p>

      <Field label="Workout Name">
        <input required value={entry.name} onChange={e => setEntry(v => ({ ...v, name: e.target.value }))}
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:border-orange-400" />
      </Field>

      <Field label="Category">
        <div className="flex gap-2">
          {FORM_CATEGORIES.map(c => (
            <button type="button" key={c} onClick={() => setEntry(v => ({ ...v, category: c }))}
              className={`${chipBase} ${entry.category === c ? chipDark : chipOff}`}>{c}</button>
          ))}
        </div>
      </Field>

      <Field label="Type">
        <div className="flex flex-wrap gap-2">
          {FORM_TYPES.map(t => (
            <button type="button" key={t} onClick={() => setEntry(v => ({ ...v, type: t }))}
              className={`${chipBase} ${entry.type === t ? chipOrange : chipOff}`}>{t}</button>
          ))}
        </div>
      </Field>

      <Field label="Instructions">
        <textarea required value={entry.instructions} onChange={e => setEntry(v => ({ ...v, instructions: e.target.value }))}
          rows={4}
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:border-orange-400" />
      </Field>

      <Field label="Why this workout?">
        <textarea value={entry.reason} onChange={e => setEntry(v => ({ ...v, reason: e.target.value }))}
          rows={2}
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:border-orange-400" />
      </Field>

      {workout.variation && (
        <Field label="Variation description">
          <input value={entry.variation} onChange={e => setEntry(v => ({ ...v, variation: e.target.value }))}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:border-orange-400" />
        </Field>
      )}

      {workout.variation && (
        <Field label="Progression (1 = easiest)">
          <input type="number" min="1" value={entry.progression} onChange={e => setEntry(v => ({ ...v, progression: e.target.value }))}
            className="w-24 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:border-orange-400" />
        </Field>
      )}

      <Field label="Route (optional)">
        <input value={entry.route} onChange={e => setEntry(v => ({ ...v, route: e.target.value }))}
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:border-orange-400"
          placeholder="e.g. strava.com/routes/..." />
      </Field>

      <Field label="Needs turnaround?">
        <div className="flex gap-2">
          <button type="button" onClick={() => setHasTurnaround(true)}
            className={`${chipBase} ${hasTurnaround ? chipOrange : chipOff}`}>Yes</button>
          <button type="button" onClick={() => setHasTurnaround(false)}
            className={`${chipBase} ${!hasTurnaround ? chipDark : chipOff}`}>No</button>
        </div>
      </Field>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      <div className="flex gap-3">
        <a href="/library"
          className="flex-1 py-4 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm text-center touch-manipulation">
          Cancel
        </a>
        <button type="submit" disabled={!entry.category || !entry.type}
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
