'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Workout } from '@/lib/data'

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const CATEGORIES = ['Quality', 'Long', 'Easy']

export default function LibraryClient({ workouts }: { workouts: Workout[] }) {
  const [category, setCategory] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<string | null>(null)

  const types = Array.from(new Set(
    workouts.filter(w => !category || w.category === category).map(w => w.type)
  )).sort()

  const visible = workouts
    .filter(w => !category || w.category === category)
    .filter(w => !typeFilter || w.type === typeFilter)
    .sort((a, b) => (a.lastRan ?? '0') < (b.lastRan ?? '0') ? -1 : 1)

  function setcat(c: string | null) {
    setCategory(c)
    setTypeFilter(null)
  }

  return (
    <div className="pt-10 pb-4">
      <div className="px-4 mb-4 flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workout Library</h1>
          <p className="text-sm text-gray-500 mt-0.5">{visible.length} workouts · oldest first</p>
        </div>
        <Link href="/library/add" className="w-9 h-9 flex items-center justify-center rounded-full bg-orange-500 text-white text-xl font-bold shadow-sm touch-manipulation">
          +
        </Link>
      </div>

      <div className="flex gap-2 px-4 overflow-x-auto pb-1 mb-2" style={{ scrollbarWidth: 'none' }}>
        <button onClick={() => setcat(null)} className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${!category ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>All</button>
        {CATEGORIES.map(c => (
          <button key={c} onClick={() => setcat(category === c ? null : c)} className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${category === c ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>{c}</button>
        ))}
      </div>

      {category && (
        <div className="flex gap-2 px-4 overflow-x-auto pb-1 mb-3" style={{ scrollbarWidth: 'none' }}>
          {types.map(t => (
            <button key={t} onClick={() => setTypeFilter(typeFilter === t ? null : t)} className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${typeFilter === t ? 'bg-orange-500 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>{t}</button>
          ))}
        </div>
      )}

      <div className="px-4 flex flex-col gap-3">
        {workouts.length === 0 && (
          <p className="text-gray-400 italic text-sm">No workouts in the library yet.</p>
        )}
        {visible.map(w => (
          <div key={w.name} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <div className="flex justify-between items-start gap-2">
              <div className="font-semibold text-gray-900">{w.name}</div>
              <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2 py-1 rounded-full shrink-0">{w.type}</span>
            </div>
            <p className="text-sm text-gray-500 mt-1.5 leading-snug">{w.reason}</p>
            <div className="flex gap-3 mt-2.5 text-xs text-gray-400">
              <span>{w.distTime}</span>
              <span>·</span>
              <span>{w.lastRan ? `Last ran ${formatDate(w.lastRan)}` : 'Never used'}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
