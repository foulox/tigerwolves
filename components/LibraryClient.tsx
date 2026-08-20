'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import type { WorkoutVariantRow } from '@/lib/data'
import { ABBREVIATIONS, RACE_TYPES } from '@/lib/data'
import DeleteWorkoutButton from '@/components/DeleteWorkoutButton'
import ReactionPicker from '@/components/ReactionPicker'
import WorkoutFlagSheet, { FlagBadge } from '@/components/WorkoutFlagSheet'
import { workoutVoteId } from '@/lib/votes'
import type { VoteData } from '@/lib/votes'

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

type StandaloneRow = { kind: 'standalone'; workout: WorkoutVariantRow }
type FamilyRow = {
  kind: 'family'
  familyId: number
  name: string; type: string; reason: string
  base: WorkoutVariantRow | null
  variants: WorkoutVariantRow[]
  total: number
  lastRan: string | null
}
type DisplayRow = StandaloneRow | FamilyRow

// Reads workout_variants/workout_families (#277) — replaces the legacy
// `workouts`-typed version. Family grouping mirrors PlanClient's own
// familyId-based grouping (#276) rather than the old name-string grouping.
export default function LibraryClient({ variants, isLeader, voteData = {} }: { variants: WorkoutVariantRow[]; isLeader: boolean; voteData?: Record<string, VoteData | null> }) {
  const [category, setCategory] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [raceFilter, setRaceFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [expandedFamily, setExpandedFamily] = useState<number | null>(null)
  const [expandedNotes, setExpandedNotes] = useState<number | null>(null)
  const [showAbbrev, setShowAbbrev] = useState(false)
  const [flagSheetFor, setFlagSheetFor] = useState<number | null>(null)

  const flaggedWorkout = flagSheetFor ? variants.find(w => w.id === flagSheetFor) ?? null : null

  const q = search.toLowerCase()
  function matchesSearch(w: WorkoutVariantRow) {
    if (!q) return true
    return (
      w.name.toLowerCase().includes(q) ||
      w.type.toLowerCase().includes(q) ||
      (w.label ?? '').toLowerCase().includes(q) ||
      w.reason.toLowerCase().includes(q) ||
      w.raceTypes.some(r => r.toLowerCase().includes(q))
    )
  }

  const types = Array.from(new Set(
    variants.filter(w => !category || w.category === category).map(w => w.type)
  )).sort()

  const filtered = variants
    .filter(w => !category || w.category === category)
    .filter(w => !typeFilter || w.type === typeFilter)
    .filter(w => !raceFilter || w.raceTypes.includes(raceFilter))
    .filter(matchesSearch)
    .sort((a, b) => (a.lastRan ?? '0') < (b.lastRan ?? '0') ? -1 : 1)

  // A family is "multi-version" (expandable Standard/Variation N group) only
  // when its familyId has more than one variant row — same rule PlanClient
  // uses (#276), so a lone variant with a non-null label still displays
  // standalone rather than as a one-item "family".
  const familyIds = useMemo(() => {
    const counts = new Map<number, number>()
    for (const w of variants) counts.set(w.familyId, (counts.get(w.familyId) ?? 0) + 1)
    const s = new Set<number>()
    for (const [id, count] of counts) if (count > 1) s.add(id)
    return s
  }, [variants])

  const displayRows: DisplayRow[] = []
  const seenFamilies = new Set<number>()
  for (const w of filtered) {
    if (!familyIds.has(w.familyId)) {
      displayRows.push({ kind: 'standalone', workout: w })
    } else if (!seenFamilies.has(w.familyId)) {
      seenFamilies.add(w.familyId)
      const allMembers = variants.filter(p => p.familyId === w.familyId)
      const base = allMembers.find(p => p.label === null) ?? null
      const members = allMembers
        .filter(p => p.label !== null)
        .sort((a, b) => (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity))
      const total = (base ? 1 : 0) + members.length
      const lastRan = allMembers.reduce<string | null>((best, p) => {
        if (!p.lastRan) return best
        if (!best) return p.lastRan
        return p.lastRan > best ? p.lastRan : best
      }, null)
      displayRows.push({ kind: 'family', familyId: w.familyId, name: w.name, type: w.type, reason: base?.reason ?? w.reason, base, variants: members, total, lastRan })
    }
  }

  function setcat(c: string | null) {
    setCategory(c)
    setTypeFilter(null)
  }

  function WorkoutMeta({ w }: { w: WorkoutVariantRow }) {
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
              onClick={e => { e.stopPropagation(); setExpandedNotes(expandedNotes === w.id ? null : w.id) }}
              className="text-xs font-semibold text-orange-500 touch-manipulation"
            >
              {expandedNotes === w.id ? 'Hide coach notes' : 'Coach notes'}
            </button>
            {expandedNotes === w.id && (
              <p className="text-xs text-gray-600 mt-1 leading-snug">{w.coachingNotes}</p>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="pb-4">
      <div className="px-4 mb-4 flex justify-between items-start">
        <p className="text-sm text-gray-500">{filtered.length} workouts · oldest first</p>
        <div className="flex items-center gap-2" data-tour="library-manage">
          <button
            onClick={() => setShowAbbrev(v => !v)}
            className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 text-gray-400 text-xs font-bold touch-manipulation"
            title="Abbreviation key"
          >
            ?
          </button>
          {isLeader && (
            <Link href="/library/add" className="w-9 h-9 flex items-center justify-center rounded-full bg-orange-500 text-white text-xl font-bold shadow-sm touch-manipulation">
              +
            </Link>
          )}
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
        {variants.length === 0 && (
          <p className="text-gray-400 italic text-sm">No workouts in the library yet.</p>
        )}
        {variants.length > 0 && displayRows.length === 0 && (
          <p className="text-gray-400 italic text-sm">No workouts match your search.</p>
        )}
        {displayRows.map(row => {
          if (row.kind === 'standalone') {
            const w = row.workout
            return (
              <div key={`s-${w.id}`} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                <div className="flex justify-between items-start gap-2">
                  <div className="font-semibold text-gray-900">{w.name}</div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {w.flagged && (
                      <FlagBadge onClick={() => setFlagSheetFor(w.id)} />
                    )}
                    {isLeader && <DeleteWorkoutButton variantId={w.id} />}
                    {isLeader && (
                      <Link
                        href={`/library/edit?variantId=${w.id}`}
                        className="w-7 h-7 flex items-center justify-center rounded-full border border-gray-200 text-gray-400 text-xs touch-manipulation"
                        title="Edit workout"
                      >✎</Link>
                    )}
                    <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{w.type}</span>
                  </div>
                </div>
                {w.label && <p className="text-xs text-gray-400 mt-0.5">{w.label}</p>}
                <p className="text-sm text-gray-500 mt-1.5 leading-snug">{w.reason}</p>
                <WorkoutMeta w={w} />
                <div className="flex justify-end mt-2">
                  <ReactionPicker
                    workoutId={workoutVoteId(w.name, w.label ?? '')}
                    workoutName={w.name}
                    initialVoteData={voteData[workoutVoteId(w.name, w.label ?? '')] ?? null}
                  />
                </div>
                {isLeader && (
                  <div className="mt-3 pt-3 border-t border-gray-50">
                    <Link
                      href={`/library/add?parent=${w.familyId}`}
                      className="text-xs font-semibold text-orange-500 touch-manipulation"
                    >
                      + Add variation
                    </Link>
                  </div>
                )}
              </div>
            )
          }

          const isExpanded = expandedFamily === row.familyId
          const familyFlagged = row.base?.flagged || row.variants.some(p => p.flagged)
          return (
            <div key={`f-${row.familyId}`} data-tour="library-variations">
              <button
                onClick={() => setExpandedFamily(isExpanded ? null : row.familyId)}
                className="w-full text-left bg-white rounded-2xl p-4 border border-gray-100 shadow-sm touch-manipulation"
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="font-semibold text-gray-900">{row.name}</div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {familyFlagged && (
                      <FlagBadge
                        onClick={(e) => {
                          e.stopPropagation()
                          const flaggedMember = row.base?.flagged ? row.base : row.variants.find(p => p.flagged)
                          if (flaggedMember) setFlagSheetFor(flaggedMember.id)
                        }}
                      />
                    )}
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
                      <div className="flex justify-between items-start">
                        <div className="text-xs font-bold text-gray-500 mb-0.5">Standard</div>
                        <div className="flex items-center gap-1.5">
                          {row.base.flagged && (
                            <FlagBadge onClick={() => setFlagSheetFor(row.base!.id)} />
                          )}
                          {isLeader && (
                            <>
                              <DeleteWorkoutButton variantId={row.base.id} />
                              <Link
                                href={`/library/edit?variantId=${row.base.id}`}
                                className="w-7 h-7 flex items-center justify-center rounded-full border border-gray-200 text-gray-400 text-xs touch-manipulation"
                                title="Edit"
                              >✎</Link>
                            </>
                          )}
                        </div>
                      </div>
                      {row.base.distTime && <div className="text-xs text-gray-400">{row.base.distTime}</div>}
                      {row.base.lastRan && <div className="text-xs text-gray-400">Last ran {formatDate(row.base.lastRan)}</div>}
                      <div className="flex justify-end mt-2">
                        <ReactionPicker
                          workoutId={workoutVoteId(row.base.name, row.base.label ?? '')}
                          workoutName={row.base.name}
                          initialVoteData={voteData[workoutVoteId(row.base.name, row.base.label ?? '')] ?? null}
                        />
                      </div>
                    </div>
                  )}
                  {row.variants.map(p => (
                    <div key={p.id} className="bg-white rounded-xl px-4 py-3 border border-gray-100">
                      <div className="flex justify-between items-start">
                        <div className="text-xs font-bold text-orange-500 mb-0.5">Variation {p.sortOrder} of {row.total}</div>
                        <div className="flex items-center gap-1.5">
                          {p.flagged && (
                            <FlagBadge onClick={() => setFlagSheetFor(p.id)} />
                          )}
                          {isLeader && (
                            <>
                              <DeleteWorkoutButton variantId={p.id} />
                              <Link
                                href={`/library/edit?variantId=${p.id}`}
                                className="w-7 h-7 flex items-center justify-center rounded-full border border-gray-200 text-gray-400 text-xs touch-manipulation"
                                title="Edit"
                              >✎</Link>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-gray-800">{p.label}</div>
                      {p.distTime && <div className="text-xs text-gray-400 mt-0.5">{p.distTime}</div>}
                      {p.lastRan && <div className="text-xs text-gray-400">Last ran {formatDate(p.lastRan)}</div>}
                      <div className="flex justify-end mt-2">
                        <ReactionPicker
                          workoutId={workoutVoteId(p.name, p.label ?? '')}
                          workoutName={p.name}
                          initialVoteData={voteData[workoutVoteId(p.name, p.label ?? '')] ?? null}
                        />
                      </div>
                    </div>
                  ))}
                  {isLeader && (
                    <Link
                      href={`/library/add?parent=${row.familyId}`}
                      className="bg-white rounded-xl px-4 py-3 border border-dashed border-orange-200 text-xs font-semibold text-orange-500 touch-manipulation text-center"
                    >
                      + Add variation
                    </Link>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {flaggedWorkout && (
        <WorkoutFlagSheet workout={flaggedWorkout} isLeader={isLeader} onClose={() => setFlagSheetFor(null)} />
      )}
    </div>
  )
}
