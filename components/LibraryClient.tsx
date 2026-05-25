'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Workout } from '@/lib/data'
import { ABBREVIATIONS, RACE_TYPES } from '@/lib/data'

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const CATEGORIES = ['Quality', 'Long', 'Easy']

const PHASE_COLORS: Record<string, string> = {
  Base: 'bg-blue-100 text-blue-700',
  Build: 'bg-orange-100 text-orange-700',
  Peak: 'bg-red-100 text-red-700',
  Taper: 'bg-green-100 text-green-700',
}

type StandaloneRow = { kind: 'standalone'; workout: Workout }
type FamilyRow = {
  kind: 'family'
  name: string; type: string; reason: string
  base: Workout | null
  progressions: Workout[]
  total: number
  lastRan: string | null
}
type DisplayRow = StandaloneRow | FamilyRow

export default function LibraryClient({ workouts }: { workouts: Workout[] }) {
  const [category, setCategory] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [raceFilter, setRaceFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [expandedFamily, setExpandedFamily] = useState<string | null>(null)
  const [expandedNotes, setExpandedNotes] = useState<string | null>(null)
  const [showAbbrev, setShowAbbrev] = useState(false)

  const q = search.toLowerCase()
  function matchesSearch(w: Workout) {
    if (!q) return true
    return (
      w.name.toLowerCase().includes(q) ||
      w.type.toLowerCase().includes(q) ||
      w.variation.toLowerCase().includes(q) ||
      w.reason.toLowerCase().includes(q) ||
      w.raceTypes.some(r => r.toLowerCase().includes(q))
    )
  }

  const types = Array.from(new Set(
    workouts.filter(w => !category || w.category === category).map(w => w.type)
  )).sort()

  const filtered = workouts
    .filter(w => !category || w.category === category)
    .filter(w => !typeFilter || w.type === typeFilter)
    .filter(w => !raceFilter || w.raceTypes.includes(raceFilter))
    .filter(matchesSearch)
    .sort((a, b) => (a.lastRan ?? '0') < (b.lastRan ?? '0') ? -1 : 1)

  const familyNames = new Set<string>()
  for (const w of workouts) {
    if (w.variation) familyNames.add(w.name)
  }

  const displayRows: DisplayRow[] = []
  const seenFamilies = new Set<string>()
  for (const w of filtered) {
    if (!familyNames.has(w.name)) {
      displayRows.push({ kind: 'standalone', workout: w })
    } else if (!seenFamilies.has(w.name)) {
      seenFamilies.add(w.name)
      const allMembers = workouts.filter(p => p.name === w.name)
      const base = allMembers.find(p => !p.variation) ?? null
      const progressions = allMembers
        .filter(p => p.variation)
        .sort((a, b) => (a.progression ?? 0) - (b.progression ?? 0))
      const total = (base ? 1 : 0) + progressions.length
      const lastRan = allMembers.reduce<string | null>((best, p) => {
        if (!p.lastRan) return best
        if (!best) return p.lastRan
        return p.lastRan > best ? p.lastRan : best
      }, null)
      displayRows.push({ kind: 'family', name: w.name, type: w.type, reason: base?.reason ?? w.reason, base, progressions, total, lastRan })
    }
  }

  function setcat(c: string | null) {
    setCategory(c)
    setTypeFilter(null)
  }

  function WorkoutMeta({ w }: { w: Workout }) {
    return (
      <div className="mt-2.5 space-y-2">
        <div className="flex gap-3 text-xs text-gray-400">
          {w.distTime && <span>{w.distTime}</span>}
          {w.distTime && w.lastRan && <span>·</span>}
          <span>{w.lastRan ? `Last ran ${formatDate(w.lastRan)}` : 'Never used'}</span>
        </div>
        {(w.raceTypes.length > 0 || w.trainingPhases.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {w.raceTypes.map(r => (
              <span key={r} className="text-xs font-medium bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{r}</span>
            ))}
            {w.trainingPhases.map(p => (
              <span key={p} className={`text-xs font-medium px-2 py-0.5 rounded-full ${PHASE_COLORS[p] ?? 'bg-gray-100 text-gray-500'}`}>{p}</span>
            ))}
          </div>
        )}
        {w.author && (
          <p className="text-xs text-gray-400 italic">— {w.author}</p>
        )}
        {w.coachingNotes && (
          <div>
            <button
              onClick={e => { e.stopPropagation(); setExpandedNotes(expandedNotes === w.name ? null : w.name) }}
              className="text-xs font-semibold text-orange-500 touch-manipulation"
            >
              {expandedNotes === w.name ? 'Hide coach notes' : 'Coach notes'}
            </button>
            {expandedNotes === w.name && (
              <p className="text-xs text-gray-600 mt-1 leading-snug">{w.coachingNotes}</p>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="pt-10 pb-4">
      <div className="px-4 mb-4 flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workout Library</h1>
          <p className="text-sm text-gray-500 mt-0.5">{filtered.length} workouts · oldest first</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAbbrev(v => !v)}
            className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 text-gray-400 text-xs font-bold touch-manipulation"
            title="Abbreviation key"
          >
            ?
          </button>
          <Link href="/library/add" className="w-9 h-9 flex items-center justify-center rounded-full bg-orange-500 text-white text-xl font-bold shadow-sm touch-manipulation">
            +
          </Link>
        </div>
      </div>

      {showAbbrev && (
        <div className="mx-4 mb-4 p-3 bg-gray-50 rounded-xl border border-gray-100">
          <p className="text-xs font-bold text-gray-700 mb-2">Abbreviation Key</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {ABBREVIATIONS.map(({ abbr, meaning }) => (
              <div key={abbr} className="flex gap-1.5 text-xs">
                <span className="font-bold text-gray-800 shrink-0">{abbr}</span>
                <span className="text-gray-500">{meaning}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="px-4 mb-3">
        <div className="relative">
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, type, race distance…"
            className="w-full rounded-xl border border-gray-200 bg-white pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-orange-400"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
        </div>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 px-4 overflow-x-auto pb-1 mb-2" style={{ scrollbarWidth: 'none' }}>
        <button onClick={() => setcat(null)} className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${!category ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>All</button>
        {CATEGORIES.map(c => (
          <button key={c} onClick={() => setcat(category === c ? null : c)} className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${category === c ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>{c}</button>
        ))}
      </div>

      {/* Race type filter */}
      <div className="flex gap-2 px-4 overflow-x-auto pb-1 mb-2" style={{ scrollbarWidth: 'none' }}>
        <button onClick={() => setRaceFilter(null)} className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${!raceFilter ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>Any race</button>
        {RACE_TYPES.map(r => (
          <button key={r} onClick={() => setRaceFilter(raceFilter === r ? null : r)} className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${raceFilter === r ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>{r}</button>
        ))}
      </div>

      {/* Type filter (only when category selected) */}
      {category && types.length > 1 && (
        <div className="flex gap-2 px-4 overflow-x-auto pb-1 mb-3" style={{ scrollbarWidth: 'none' }}>
          <button onClick={() => setTypeFilter(null)} className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${!typeFilter ? 'bg-orange-500 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>All types</button>
          {types.map(t => (
            <button key={t} onClick={() => setTypeFilter(typeFilter === t ? null : t)} className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${typeFilter === t ? 'bg-orange-500 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>{t}</button>
          ))}
        </div>
      )}

      <div className="px-4 flex flex-col gap-3">
        {workouts.length === 0 && (
          <p className="text-gray-400 italic text-sm">No workouts in the library yet.</p>
        )}
        {workouts.length > 0 && displayRows.length === 0 && (
          <p className="text-gray-400 italic text-sm">No workouts match your search.</p>
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
                {w.variation && <p className="text-xs text-gray-400 mt-0.5">{w.variation}</p>}
                <p className="text-sm text-gray-500 mt-1.5 leading-snug">{w.reason}</p>
                <WorkoutMeta w={w} />
                <div className="mt-3 pt-3 border-t border-gray-50">
                  <Link
                    href={`/library/add?parent=${encodeURIComponent(w.name)}`}
                    className="text-xs font-semibold text-orange-500 touch-manipulation"
                  >
                    + Add variation
                  </Link>
                </div>
              </div>
            )
          }

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
                      {row.total} versions
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
                  {row.base && (
                    <div className="bg-white rounded-xl px-4 py-3 border border-gray-100">
                      <div className="text-xs font-bold text-gray-500 mb-0.5">Standard</div>
                      {row.base.distTime && <div className="text-xs text-gray-400">{row.base.distTime}</div>}
                      {row.base.lastRan && <div className="text-xs text-gray-400">Last ran {formatDate(row.base.lastRan)}</div>}
                    </div>
                  )}
                  {row.progressions.map(p => (
                    <div key={p.progression} className="bg-white rounded-xl px-4 py-3 border border-gray-100">
                      <div className="text-xs font-bold text-orange-500 mb-0.5">Variation {p.progression} of {row.total}</div>
                      <div className="text-sm font-semibold text-gray-800">{p.variation}</div>
                      {p.distTime && <div className="text-xs text-gray-400 mt-0.5">{p.distTime}</div>}
                      {p.lastRan && <div className="text-xs text-gray-400">Last ran {formatDate(p.lastRan)}</div>}
                    </div>
                  ))}
                  <Link
                    href={`/library/add?parent=${encodeURIComponent(row.name)}`}
                    className="bg-white rounded-xl px-4 py-3 border border-dashed border-orange-200 text-xs font-semibold text-orange-500 touch-manipulation text-center"
                  >
                    + Add variation
                  </Link>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
