'use client'

import { useState, useTransition } from 'react'
import { addWorkout } from '@/app/actions'

const CATEGORIES = ['Easy', 'Long', 'Quality']
const TYPES = ['Hills', 'Broken Tempo', 'Progression', 'Ladder', 'Superset', 'Straight Tempo', 'Threshold']

export default function AddWorkoutForm() {
  const [category, setCategory] = useState('')
  const [type, setType] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const formData = new FormData(e.currentTarget)
    formData.set('category', category)
    formData.set('type', type)
    startTransition(async () => {
      try {
        await addWorkout(formData)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="px-4 pt-10 pb-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">New Workout</h1>
      </header>

      <div className="mb-5">
        <label className="text-sm font-bold text-gray-700 block mb-1.5">Workout Name</label>
        <input
          name="name"
          required
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:border-orange-400"
          placeholder="e.g. Hills 10 x 60sec"
        />
      </div>

      <div className="mb-5">
        <label className="text-sm font-bold text-gray-700 block mb-1.5">Category</label>
        <div className="flex gap-2">
          {CATEGORIES.map(c => (
            <button
              type="button"
              key={c}
              onClick={() => setCategory(c)}
              className={`px-4 py-2 rounded-full text-sm font-semibold border transition-colors touch-manipulation ${category === c ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-5">
        <label className="text-sm font-bold text-gray-700 block mb-1.5">Type</label>
        <div className="flex flex-wrap gap-2">
          {TYPES.map(t => (
            <button
              type="button"
              key={t}
              onClick={() => setType(t)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors touch-manipulation ${type === t ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-gray-200'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-5">
        <label className="text-sm font-bold text-gray-700 block mb-1.5">Why this workout?</label>
        <textarea
          name="reason"
          rows={2}
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:border-orange-400"
          placeholder="Brief description of the purpose"
        />
      </div>

      <div className="mb-5">
        <label className="text-sm font-bold text-gray-700 block mb-1.5">Instructions</label>
        <textarea
          name="instructions"
          required
          rows={5}
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:border-orange-400"
          placeholder="e.g. 10 x 60 sec at 5K pace, 60 sec recovery"
        />
      </div>

      <div className="mb-8">
        <label className="text-sm font-bold text-gray-700 block mb-1.5">Distance / Time</label>
        <input
          name="distTime"
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:border-orange-400"
          placeholder="e.g. 5–7 miles · 45 min"
        />
      </div>

      {error && (
        <p className="text-red-500 text-sm mb-4">{error}</p>
      )}

      <button
        type="submit"
        disabled={isPending || !category || !type}
        className="w-full py-4 rounded-xl bg-orange-500 text-white font-semibold text-sm disabled:opacity-40 transition-colors touch-manipulation"
      >
        {isPending ? 'Saving...' : 'Save Workout'}
      </button>
    </form>
  )
}
