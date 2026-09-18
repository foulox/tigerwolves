'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { addWorkout } from '@/app/actions'
import { RACE_TYPES, TRAINING_PHASES } from '@/lib/data'
import type { RunGroup } from '@/lib/data'
import { FORM_CATEGORIES, typesForCategory, chipBase, chipDark, chipOrange, chipOff, toggleItem, findCollidingFamily } from '@/lib/workoutForm'
import type { InferredFields } from '@/lib/workoutInference'

type Step = 'entry' | 'loading' | 'review'

type EntryData = {
  name: string
  category: string
  type: string
  instructions: string
  reason: string
  route: string
  runGroupId: number | null
  hasTurnaroundHint: boolean
}

export default function AddWorkoutForm({
  existingFamilies = [],
  authorizedGroups = [],
  defaultGroupId = null,
}: {
  existingFamilies?: { familyId: number; name: string }[]
  authorizedGroups?: RunGroup[]
  defaultGroupId?: number | null
}) {
  const [step, setStep] = useState<Step>('entry')
  const [collision, setCollision] = useState<{ familyId: number; name: string } | null>(null)
  const [entry, setEntry] = useState<EntryData>({
    name: '', category: '', type: '', instructions: '', reason: '', route: '',
    // #401 (Story A): a new workout is owned by the leader's own run's group so it
    // lands in that run's per-run library. The picker below only appears (and only
    // offers authorized groups) when the leader leads more than one group.
    runGroupId: defaultGroupId,
    hasTurnaroundHint: false,
  })
  const [review, setReview] = useState<InferredFields | null>(null)
  const [hasTurnaround, setHasTurnaround] = useState(false)
  const [turnaround, setTurnaround] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  async function handleEntry(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    // #354: block a duplicate name before spending an AI-inference call — surface
    // the existing family and let the leader add a variation to it instead.
    const collide = findCollidingFamily(existingFamilies, entry.name)
    if (collide) { setCollision(collide); return }
    setStep('loading')
    try {
      const res = await fetch('/api/workout/infer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...entry, venue: null }),
      })
      if (!res.ok) throw new Error('Inference failed')
      const inferred: InferredFields = await res.json()
      setReview(inferred)
      setHasTurnaround(inferred.hasTurnaround)
      setTurnaround(inferred.turnaround)
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
    formData.set('runGroupId', entry.runGroupId != null ? String(entry.runGroupId) : '')
    formData.set('distTime', review!.distTime)
    formData.set('energySystem', review!.energySystem)
    formData.set('hrZone', review!.hrZone)
    formData.set('rpe', review!.rpe)
    formData.set('raceTypes', review!.raceTypes.join(', '))
    formData.set('trainingPhases', review!.trainingPhases.join(', '))
    formData.set('author', review!.author)
    formData.set('coachingNotes', review!.coachingNotes)
    formData.set('hasTurnaround', String(hasTurnaround))
    formData.set('turnaround', turnaround)
    return formData
  }

  function handleSave() {
    if (!review) return
    setError('')
    startTransition(async () => {
      try {
        await addWorkout(buildFormData())
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  if (collision) {
    return (
      <div className="px-4 pt-10 pb-10">
        <header className="mb-2">
          <h1 className="text-2xl font-bold text-gray-900">Already in the library</h1>
        </header>
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 mb-6">
          <p className="text-sm text-gray-700">
            A workout called <span className="font-semibold">&ldquo;{collision.name}&rdquo;</span> already
            exists in the shared library. Add your version as a <span className="font-semibold">variation</span> of
            it so everyone finds it in one place — or use a different name.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Link
            href={`/library/add?parent=${collision.familyId}`}
            className="w-full py-4 rounded-xl bg-orange-500 text-white font-semibold text-sm text-center touch-manipulation"
          >
            Add a variation to &ldquo;{collision.name}&rdquo;
          </Link>
          <button
            type="button"
            onClick={() => setCollision(null)}
            className="w-full py-4 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm touch-manipulation"
          >
            Use a different name
          </button>
        </div>
      </div>
    )
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
        <p className="text-sm text-gray-500 mb-6">Fields pre-filled by AI — adjust anything before saving.</p>

        <div className="bg-gray-50 rounded-2xl p-4 mb-6 border border-gray-100">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Workout</p>
          <p className="font-semibold text-gray-900">{entry.name}</p>
          <p className="text-xs text-gray-500 mt-0.5">{entry.category} · {entry.type}</p>
        </div>

        <Field label="Author / Source">
          <input value={review.author} onChange={e => setReview(r => r && ({ ...r, author: e.target.value }))}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:border-orange-400" />
        </Field>

        <Field label="Distance / Time">
          <input value={review.distTime} onChange={e => setReview(r => r && ({ ...r, distTime: e.target.value }))}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:border-orange-400" />
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

        <Field label="Needs turnaround?">
          <div className="flex gap-2">
            <button type="button" onClick={() => setHasTurnaround(true)}
              className={`${chipBase} ${hasTurnaround ? chipOrange : chipOff}`}>Yes</button>
            <button type="button" onClick={() => setHasTurnaround(false)}
              className={`${chipBase} ${!hasTurnaround ? chipDark : chipOff}`}>No</button>
          </div>
        </Field>

        {hasTurnaround && (
          <Field label="Turnaround point">
            <input value={turnaround} onChange={e => setTurnaround(e.target.value)}
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
            {isPending ? 'Saving...' : 'Save Workout'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleEntry} className="px-4 pt-10 pb-10">
      <header className="mb-2">
        <h1 className="text-2xl font-bold text-gray-900">New Workout</h1>
      </header>
      <p className="text-sm text-gray-500 mb-6">Fill in the basics — AI will suggest the rest.</p>

      <Field label="Workout Name">
        <input required value={entry.name} onChange={e => setEntry(v => ({ ...v, name: e.target.value }))}
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:border-orange-400"
          placeholder="e.g. Hills 10 × 60s" />
      </Field>

      <Field label="Category">
        <div className="flex gap-2">
          {FORM_CATEGORIES.map(c => (
            <button type="button" key={c}
              onClick={() => setEntry(v => {
                // Auto-select the type when a category has exactly one (e.g. Long) —
                // a lone chip is noise; the leader shouldn't have to tap it.
                const opts = typesForCategory(c)
                return { ...v, category: c, type: opts.length === 1 ? opts[0] : '' }
              })}
              className={`${chipBase} ${entry.category === c ? chipDark : chipOff}`}>{c}</button>
          ))}
        </div>
      </Field>

      {typesForCategory(entry.category).length > 1 && (
        <Field label="Type">
          <div className="flex flex-wrap gap-2">
            {typesForCategory(entry.category).map(t => (
              <button type="button" key={t} onClick={() => setEntry(v => ({ ...v, type: t }))}
                className={`${chipBase} ${entry.type === t ? chipOrange : chipOff}`}>{t}</button>
            ))}
          </div>
        </Field>
      )}

      {/* #401: owner picker — only when the leader leads more than one run group.
          Offers ONLY authorized groups (never a global list). A single-group leader
          gets the default silently (a lone chip would be noise). */}
      {authorizedGroups.length > 1 && (
        <Field label="Run group (who owns this workout)">
          <div className="flex flex-wrap gap-2">
            {authorizedGroups.map(g => (
              <button type="button" key={g.id} onClick={() => setEntry(v => ({ ...v, runGroupId: g.id }))}
                className={`${chipBase} ${entry.runGroupId === g.id ? chipDark : chipOff}`}>{g.name}</button>
            ))}
          </div>
        </Field>
      )}

      <Field label="Instructions">
        <textarea required value={entry.instructions} onChange={e => setEntry(v => ({ ...v, instructions: e.target.value }))}
          rows={4}
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:border-orange-400"
          placeholder="WU: 15 min easy. Main: 10×60s@5K, r=jog down. CD: 10 min easy." />
      </Field>

      <Field label="Why this workout?">
        <textarea value={entry.reason} onChange={e => setEntry(v => ({ ...v, reason: e.target.value }))}
          rows={2}
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:border-orange-400"
          placeholder="Brief description of the purpose" />
      </Field>

      <Field label="Route (optional)">
        <input value={entry.route} onChange={e => setEntry(v => ({ ...v, route: e.target.value }))}
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:border-orange-400"
          placeholder="e.g. strava.com/routes/... or mapmyrun.com/..." />
      </Field>

      <Field label="Needs turnaround?">
        <div className="flex gap-2">
          <button type="button" onClick={() => setEntry(v => ({ ...v, hasTurnaroundHint: true }))}
            className={`${chipBase} ${entry.hasTurnaroundHint ? chipOrange : chipOff}`}>Yes</button>
          <button type="button" onClick={() => setEntry(v => ({ ...v, hasTurnaroundHint: false }))}
            className={`${chipBase} ${!entry.hasTurnaroundHint ? chipDark : chipOff}`}>No</button>
        </div>
        <p className="text-xs text-gray-400 mt-1">Just a starting guess — AI will refine it on the next screen.</p>
      </Field>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      <button type="submit" disabled={!entry.category || !entry.type}
        className="w-full py-4 rounded-xl bg-orange-500 text-white font-semibold text-sm disabled:opacity-40 transition-colors touch-manipulation">
        Next →
      </button>
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
