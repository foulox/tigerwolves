'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Workout } from '@/lib/data'

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const CATEGORIES = ['Quality', 'Long', 'Easy']

type StandaloneRow = { kind: 'standalone'; workout: Workout }
type FamilyRow = {
  kind: 'family'
  name: string; type: string; reason: string
  progressions: Workout[]
  lastRan: string | null
}
type DisplayRow = StandaloneRow | FamilyRow

export default function LibraryClient({ workouts }: { workouts: Workout[] }) {
  const [category, setCategory] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [expandedFamily, setExpandedFamily] = useState<string | null>(null)

  const types = Array.from(new Set(
    workouts.filter(w => !category || w.category === category).map(w => w.type)
  )).sort()

  const filtered = workouts
    .filter(w => !category || w.category === category)
    .filter(w => !typeFilter || w.type === typeFilter)
    .sort((a, b) => (a.lastRan ?? '0') < (b.lastRan ?? '0') ? -1 : 1)

  // Build display rows: group variation families, keep standalones flat
  const displayRows: DisplayRow[] = []
  const seenFamilies = new Set<string>()
  for (const w of filtered) {
    if (!w.variation) {
      displayRows.push({ kind: 'standalone', workout: w })
    } else if (!seenFamilies.has(w.name)) {
      seenFamilies.add(w.name)
      const progressions = workouts
        .filter(p => p.name === w.name && p.variation)
        .sort((a, b) => (a.progression ?? 0) - (b.progression ?? 0))
      const lastRan = progressions.reduce<string | null>((best, p) => {
        if (!p.lastRan) return best
        if (!best) return p.lastRan
        return p.lastRan > best ? p.lastRan : best
      }, null)
      displayRows.push({ kind: 'family', name: w.name, type: w.type, reason: w.reason, progressions, lastRan })
    }
  }

  function setcat(c: string | null) {
    setCategory(c)
    setTypeFilter(null)
  }

  return (
    <div className="pt-10 pb-4">
      <div className="px-4 mb-4 flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workout Library</h1>
          <p className="text-sm text-gray-500 mt-0.5">{filtered.length} workouts · oldest first</p>
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
        {displayRows.map(row => {
          if (row.kind === 'standalone') {
            const w = row.workout
            return (
              <div key={`s-${w.name}`} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
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
            )
          }

          // Family row
          const isExpanded = expandedFamily === row.name
          return (
            <div key={`f-${row.name}`}>
              <button
                onClick={() => setExpandedFamily(isExpanded ? null : row.name)}
                className="w-full text-left bg-white rounded-2xl p-4 border border-gray-100 shadow-sm touch-manipulation"
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="font-semibold text-gray-900">{row.name}</div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs font-semibold bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">
                      {row.progressions.length} progressions
                    </span>
                    <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{row.type}</span>
                  </div>
                </div>
                <p className="text-sm text-gray-500 mt-1.5 leading-snug">{row.reason}</p>
                <div className="text-xs text-gray-400 mt-2">
                  {row.lastRan ? `Last ran ${formatDate(row.lastRan)}` : 'Never used'} · tap to {isExpanded ? 'collapse' : 'expand'}
                </div>
              </button>

              {isExpanded && (
                <div className="mt-1 ml-2 flex flex-col gap-1">
                  {row.progressions.map(p => (
                    <div key={p.progression} className="bg-white rounded-xl px-4 py-3 border border-gray-100">
                      <div className="text-xs font-bold text-orange-500 mb-0.5">P{p.progression}</div>
                      <div className="text-sm font-semibold text-gray-800">{p.variation}</div>
                      {p.distTime && <div className="text-xs text-gray-400 mt-0.5">{p.distTime}</div>}
                      {p.lastRan && <div className="text-xs text-gray-400">Last ran {formatDate(p.lastRan)}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
