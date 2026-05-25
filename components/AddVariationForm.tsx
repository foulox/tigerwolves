'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addVariation } from '@/app/actions'
import type { Workout } from '@/lib/data'

export default function AddVariationForm({ parent, siblings, nextProgression }: { parent: Workout; siblings: Workout[]; nextProgression: number }) {
  const [variation, setVariation] = useState('')
  const [instructions, setInstructions] = useState(parent.instructions)
  const [distTime, setDistTime] = useState(parent.distTime)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!variation.trim()) { setError('Variation description is required.'); return }
    setError('')
    startTransition(async () => {
      try {
        await addVariation(parent, variation.trim(), nextProgression, instructions, distTime)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  return (
    <form onSubmit={handleSave} className="px-4 pt-10 pb-10">
      <header className="mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Add Variation</h1>
      </header>
      <p className="text-sm text-gray-500 mb-6">Branch from an existing workout — inherits all fields, you set what&apos;s different.</p>

      <div className="bg-gray-50 rounded-2xl p-4 mb-6 border border-gray-100">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Branching from</p>
        <p className="font-semibold text-gray-900">{parent.name}</p>
        <p className="text-xs text-gray-500 mt-0.5">{parent.category} · {parent.type}</p>
        {parent.reason && <p className="text-xs text-gray-400 mt-1 leading-snug">{parent.reason}</p>}

        {siblings.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <p className="text-xs font-bold text-gray-500 mb-1.5">Existing variations</p>
            <div className="flex flex-col gap-1">
              {siblings.map(s => (
                <div key={s.progression} className="flex items-baseline gap-2">
                  <span className="text-xs font-bold text-orange-500 shrink-0">V{s.progression}</span>
                  <span className="text-xs text-gray-600">{s.variation}</span>
                </div>
              ))}
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-xs font-bold text-orange-300 shrink-0">V{nextProgression}</span>
                <span className="text-xs text-gray-400 italic">← you are adding this</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mb-5">
        <label className="text-sm font-bold text-gray-700 block mb-1.5">
          What&apos;s different? <span className="text-orange-500">*</span>
        </label>
        <input
          required
          value={variation}
          onChange={e => setVariation(e.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:border-orange-400"
          placeholder="e.g. 3×2mi@HMP, r3min"
        />
        <p className="text-xs text-gray-400 mt-1">Short description of this version — shows as the variation label</p>
      </div>

      <div className="mb-5">
        <label className="text-sm font-bold text-gray-700 block mb-1.5">Instructions</label>
        <textarea
          value={instructions}
          onChange={e => setInstructions(e.target.value)}
          rows={4}
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:border-orange-400"
          placeholder="WU: 15 min easy. Main: ..." />
      </div>

      <div className="mb-5">
        <label className="text-sm font-bold text-gray-700 block mb-1.5">Dist / Time</label>
        <input
          value={distTime}
          onChange={e => setDistTime(e.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:border-orange-400"
          placeholder="e.g. ~9 miles, ~60 min" />
      </div>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      <div className="flex gap-3">
        <button type="button" onClick={() => router.back()}
          className="flex-1 py-4 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm touch-manipulation">
          Cancel
        </button>
        <button type="submit" disabled={isPending || !variation.trim()}
          className="flex-[2] py-4 rounded-xl bg-orange-500 text-white font-semibold text-sm disabled:opacity-40 transition-colors touch-manipulation">
          {isPending ? 'Saving...' : 'Save Variation'}
        </button>
      </div>
    </form>
  )
}
