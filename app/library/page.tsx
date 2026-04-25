'use client'

import { useState } from 'react'
import { WORKOUTS, type WorkoutType } from '@/lib/data'

const ALL_TYPES: WorkoutType[] = [
  'Hills',
  'Broken Tempo',
  'Progression',
  'Ladder',
  'Superset',
  'Straight Tempo',
  'Threshold',
]

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function LibraryPage() {
  const [filter, setFilter] = useState<WorkoutType | null>(null)

  const visible = [...WORKOUTS]
    .filter(w => !filter || w.type === filter)
    .sort((a, b) => (a.lastUsed ?? '0') < (b.lastUsed ?? '0') ? -1 : 1)

  return (
    <div className="pt-10 pb-4">
      <div className="px-4 mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Workout Library</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {filter ? `${visible.length} ${filter} workouts` : `${WORKOUTS.length} workouts`} · oldest first
        </p>
      </div>

      <div className="flex gap-2 px-4 overflow-x-auto pb-1 mb-4" style={{ scrollbarWidth: 'none' }}>
        <button
          onClick={() => setFilter(null)}
          className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
            filter === null ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'
          }`}
        >
          All
        </button>
        {ALL_TYPES.map(t => (
          <button
            key={t}
            onClick={() => setFilter(filter === t ? null : t)}
            className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
              filter === t ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="px-4 flex flex-col gap-3">
        {visible.map(w => (
          <div key={w.id} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <div className="flex justify-between items-start gap-2">
              <div className="font-semibold text-gray-900">{w.name}</div>
              <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2 py-1 rounded-full shrink-0">
                {w.type}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1.5 leading-snug">{w.description}</p>
            <div className="flex gap-3 mt-2.5 text-xs text-gray-400">
              <span>{w.idealDistance}</span>
              <span>·</span>
              <span>{w.lastUsed ? `Last used ${formatDate(w.lastUsed)}` : 'Never used'}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
