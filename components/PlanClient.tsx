'use client'

import { useState, useMemo } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Copy, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import type { ScheduleEntry, WorkoutVariantRow } from '@/lib/data'
import { resolveWorkoutVariant } from '@/lib/scheduleUtils'
import { buildPost, formatDateLong } from '@/lib/postBuilder'
import { setPlanWorkout } from '@/app/actions'
import { captureClientEvent } from '@/lib/analyticsClient'
import { workoutVoteId, ratingToEmoji } from '@/lib/votes'
import type { VoteData } from '@/lib/votes'
import Header from '@/components/Header'

function formatDateShort(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}


type PlanStandaloneRow = { kind: 'standalone'; workout: WorkoutVariantRow }
type PlanFamilyRow = { kind: 'family'; familyId: number; name: string; variants: WorkoutVariantRow[]; total: number }
type PlanDisplayRow = PlanStandaloneRow | PlanFamilyRow

function VoteBadge({ v }: { v: { avg: number; count: number } | null | undefined }) {
  if (v && v.count > 0) {
    return <span className="text-xs text-gray-400 tabular-nums">{ratingToEmoji(v.avg)} {v.count}</span>
  }
  return <span className="text-xs text-gray-300">🙂</span>
}

// No "Edit" link here (unlike the old Workout-typed WorkoutDetail this replaces) —
// /library/edit is still legacy-table-backed and 404s for any workout added via
// the new-schema-only addWorkout path (#274) since it has no legacy `workouts`
// row at all. Editing moves to variant_id in #277; until then this screen is
// read-only for leaders too.
//
// #288: instructions + coaching notes are always visible in the card body
// (not hidden behind this expand) — Lou prefers coach's notes over "why this
// workout" as the second always-visible field, so reason lives here instead.
// Everything else that has a value still lives here too — nothing with data
// gets silently dropped, just deprioritized behind "Show details".
function WorkoutDetail({ w }: { w: WorkoutVariantRow }) {
  return (
    <div className="mt-3 pt-3 border-t border-gray-100 space-y-2 text-sm text-gray-600">
      {w.reason && (
        <p className="leading-snug">{w.reason}</p>
      )}
      {w.energySystem && (
        <p className="text-xs text-gray-500"><span className="font-semibold">Energy:</span> {w.energySystem}</p>
      )}
      {w.hrZone && (
        <p className="text-xs text-gray-500"><span className="font-semibold">HR:</span> {w.hrZone}</p>
      )}
      {w.rpe && (
        <p className="text-xs text-gray-500"><span className="font-semibold">RPE:</span> {w.rpe}</p>
      )}
      {w.raceTypes.length > 0 && (
        <p className="text-xs text-gray-500"><span className="font-semibold">Best for race:</span> {w.raceTypes.join(', ')}</p>
      )}
      {w.trainingPhases.length > 0 && (
        <p className="text-xs text-gray-500"><span className="font-semibold">Training phase:</span> {w.trainingPhases.join(', ')}</p>
      )}
      {w.hasTurnaround && w.turnaround && (
        <p className="text-xs text-gray-500"><span className="font-semibold">Turnaround:</span> {w.turnaround}</p>
      )}
      {w.author && (
        <p className="text-xs text-gray-400 italic">— {w.author}</p>
      )}
      {w.mapLink && (
        <a href={w.mapLink} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-blue-500 touch-manipulation">
          Map ↗
        </a>
      )}
    </div>
  )
}

type Props = {
  upcoming: ScheduleEntry[]
  variants: WorkoutVariantRow[]
  initialWeekIndex?: number
  isLeader: boolean
  voteData?: Record<string, VoteData | null>
}

export default function PlanClient({ upcoming, variants, initialWeekIndex = 0, isLeader, voteData = {} }: Props) {
  const [weekIndex, setWeekIndex] = useState(initialWeekIndex)
  const [selectedWorkouts, setSelectedWorkouts] = useState<WorkoutVariantRow[]>([])
  const [showCount, setShowCount] = useState(3)
  const [pickerSearch, setPickerSearch] = useState('')
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [activeType, setActiveType] = useState<string | null>(null)
  const [planTab, setPlanTab] = useState<'post' | 'browse'>('post')

  const entry = upcoming[weekIndex]

  const scheduledTypes = entry ? entry.workoutType.split(' or ').map(t => t.trim()) : []
  const effectiveType = activeType ?? scheduledTypes[0] ?? ''

  const availableTypes = useMemo(() =>
    [...new Set(variants.filter(w => w.category === 'Quality').map(w => w.type))].sort()
  , [variants])

  // A family is "multi-version" (Standard/Longer picker UI) when it has more
  // than one variant row — label alone isn't the signal, since a lone variant
  // can still carry a non-null label.
  const familyIds = useMemo(() => {
    const counts = new Map<number, number>()
    for (const w of variants) counts.set(w.familyId, (counts.get(w.familyId) ?? 0) + 1)
    const s = new Set<number>()
    for (const [id, count] of counts) if (count > 1) s.add(id)
    return s
  }, [variants])

  // Look up the already-scheduled workout across the FULL library, not the
  // type-filtered allSuggestions — a leader can deliberately schedule a workout
  // whose type doesn't match the week's nominal type (a real override, not bad
  // data), and that should still be recognized rather than silently swapped
  // for an unrelated suggestion.
  const plannedWorkout = useMemo(() => {
    if (!entry?.workoutName) return null
    return resolveWorkoutVariant(variants, entry.workoutName, entry.selectedVariations)
  }, [entry, variants])

  const plannedNotFound = !!entry?.workoutName && plannedWorkout === null

  const allSuggestions = useMemo(() => {
    if (!entry) return []
    const types = activeType ? [activeType] : entry.workoutType.split(' or ').map(t => t.trim())
    return variants
      .filter(w => types.includes(w.type))
      .filter(w => !plannedWorkout || workoutKey(w) !== workoutKey(plannedWorkout))
      .sort((a, b) => (a.lastRan ?? '0') < (b.lastRan ?? '0') ? -1 : 1)
  }, [entry, variants, activeType, plannedWorkout])

  const pickerSource = useMemo(() => {
    const q = pickerSearch.toLowerCase()
    if (!q) return allSuggestions
    return variants
      .filter(w =>
        w.name.toLowerCase().includes(q) ||
        w.type.toLowerCase().includes(q) ||
        (w.label ?? '').toLowerCase().includes(q) ||
        w.reason.toLowerCase().includes(q) ||
        w.raceTypes.some(r => r.toLowerCase().includes(q))
      )
      .filter(w => !plannedWorkout || workoutKey(w) !== workoutKey(plannedWorkout))
      .sort((a, b) => (a.lastRan ?? '0') < (b.lastRan ?? '0') ? -1 : 1)
  }, [pickerSearch, allSuggestions, variants, plannedWorkout])

  const displayRows = useMemo<PlanDisplayRow[]>(() => {
    const rows: PlanDisplayRow[] = []
    const seen = new Set<number>()
    for (const w of pickerSource) {
      if (!familyIds.has(w.familyId)) {
        rows.push({ kind: 'standalone', workout: w })
      } else if (!seen.has(w.familyId)) {
        seen.add(w.familyId)
        const members = pickerSource
          .filter(p => p.familyId === w.familyId)
          .sort((a, b) => (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity))
        rows.push({ kind: 'family', familyId: w.familyId, name: w.name, variants: members, total: members.length })
      }
    }
    return rows
  }, [pickerSource, familyIds])

  const visibleRows = pickerSearch ? displayRows : displayRows.slice(0, showCount)
  const remainingCount = pickerSearch ? 0 : displayRows.length - showCount

  const effectiveSelections: WorkoutVariantRow[] = selectedWorkouts.length > 0
    ? selectedWorkouts
    : plannedWorkout
      ? [plannedWorkout]
      : entry?.workoutName
        ? []
        : (() => {
            const w = allSuggestions[0] ?? null
            return w ? [w] : []
          })()

  function workoutKey(w: WorkoutVariantRow) {
    return String(w.id)
  }

  function isEffectivelySelected(w: WorkoutVariantRow): boolean {
    return effectiveSelections.some(s => workoutKey(s) === workoutKey(w))
  }

  function changeWeek(idx: number) {
    setWeekIndex(idx)
    setSelectedWorkouts([])
    setShowCount(3)
    setPickerSearch('')
    setCopied(false)
    setSaved(false)
    setExpandedId(null)
    setActiveType(null)
    setPlanTab('post')
  }

  function toggleExpand(id: string) {
    setExpandedId(prev => prev === id ? null : id)
  }

  function handleSelect(w: WorkoutVariantRow) {
    setSelectedWorkouts(prev => {
      const key = workoutKey(w)
      if (prev.some(s => workoutKey(s) === key)) {
        return prev.filter(s => workoutKey(s) !== key)
      }
      if (prev.length === 2 && prev[0].familyId === w.familyId) {
        return [prev[0], w]
      }
      if (prev.length === 1 && prev[0].familyId === w.familyId) {
        return [prev[0], w]
      }
      return [w]
    })
    setSaved(false)
  }

  const post = entry && effectiveSelections.length > 0 ? buildPost(entry, effectiveSelections, activeType) : ''

  function handleCopy() {
    navigator.clipboard.writeText(post).then(() => {
      setCopied(true)
      captureClientEvent('heylo_post_copied')
      setTimeout(() => setCopied(false), 2000)
    })
  }

  async function handleSetPlan() {
    if (!entry || effectiveSelections.length === 0) return
    const sorted = [...effectiveSelections].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    setSaving(true)
    try {
      await setPlanWorkout(entry.date, sorted[0].name, sorted.map(w => w.label ?? ''))
      setSaved(true)
      setPlanTab('post')
    } catch (err) {
      Sentry.captureException(err, { extra: { date: entry.date, workoutName: sorted[0].name } })
    } finally {
      setSaving(false)
    }
  }

  if (upcoming.length === 0) {
    return (
      <>
        <Header title="Plan" isLeader={isLeader} />
        <div className="px-4" data-tour="heylo-area">
          <p className="text-gray-500 mt-4">No upcoming weeks on the schedule.</p>
        </div>
      </>
    )
  }

  return (
    <>
      <Header title="Plan" isLeader={isLeader} />
      <div className="px-4 pb-4" data-tour="heylo-area">

        {/* Week nav */}
        <div className="flex items-center justify-between mb-5 bg-white rounded-2xl border border-gray-100 shadow-sm px-2 py-2">
          <button
            onClick={() => changeWeek(weekIndex - 1)}
            disabled={weekIndex === 0}
            className="p-2 rounded-xl touch-manipulation disabled:opacity-30 text-gray-500 active:bg-gray-100"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="text-center">
            <div className="text-sm font-semibold text-gray-900">{entry?.leader || '—'}</div>
            <div className="text-xs text-gray-400">{entry ? formatDateShort(entry.date) : ''}</div>
          </div>
          <button
            onClick={() => changeWeek(weekIndex + 1)}
            disabled={weekIndex >= upcoming.length - 1}
            className="p-2 rounded-xl touch-manipulation disabled:opacity-30 text-gray-500 active:bg-gray-100"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {entry && (
          <>
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 mb-6">
              <div className="text-xs font-bold text-orange-500 tracking-wide mb-1">WORKOUT TYPE</div>
              <div className="text-2xl font-bold text-gray-900">{activeType ?? entry.workoutType}</div>
              {activeType && (
                <div className="text-xs text-gray-500 mt-0.5">Scheduled: {entry.workoutType}</div>
              )}
              <div className="text-xs text-gray-400 mt-1">{formatDateLong(entry.date)}</div>
              <div className="flex gap-2 overflow-x-auto mt-3 pb-0.5 -mx-1 px-1">
                {availableTypes.map(t => {
                  const isActive = activeType === null ? scheduledTypes.includes(t) : t === activeType
                  return (
                    <button key={t} type="button"
                      onClick={() => setActiveType(scheduledTypes.includes(t) ? null : t)}
                      className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold touch-manipulation transition-colors ${
                        isActive ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 border border-gray-200'
                      }`}
                    >
                      {t}
                    </button>
                  )
                })}
              </div>
            </div>

            {plannedNotFound && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-3 mb-4 text-sm text-red-700">
                ⚠️ &ldquo;{entry.workoutName}&rdquo; is no longer in the workout library — pick a replacement below.
              </div>
            )}

            {plannedWorkout && (() => {
              const w = plannedWorkout
              const sel = isEffectivelySelected(w)
              const eid = `planned-${w.id}`
              const expanded = expandedId === eid
              return (
                <div className="mb-4">
                  <div className="text-sm font-bold text-gray-700 mb-2">Currently planned</div>
                  <div
                    className={`bg-white rounded-2xl border shadow-sm transition-colors ${sel ? 'border-orange-400 ring-1 ring-orange-300' : 'border-gray-100'}`}
                  >
                    <button
                      onClick={() => handleSelect(w)}
                      className="w-full text-left p-4 touch-manipulation cursor-pointer"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="font-semibold text-gray-900">{w.name}</div>
                        <div className="flex items-center gap-2 shrink-0">
                          <VoteBadge v={voteData[workoutVoteId(w.name, w.label ?? '')]} />
                          <span className="text-xs text-gray-400">{w.lastRan ? formatDateShort(w.lastRan) : 'Never'}</span>
                        </div>
                      </div>
                      {w.label && <div className="text-xs text-gray-400 mt-0.5">{w.label}</div>}
                      {w.rawInput && <div className="text-sm text-gray-700 mt-1.5 whitespace-pre-wrap leading-snug">{w.rawInput}</div>}
                      {w.coachingNotes && <div className="text-sm text-gray-500 mt-1.5 italic leading-snug">{w.coachingNotes}</div>}
                      <div className="text-xs text-gray-400 mt-2">{w.distTime}</div>
                    </button>
                    <button
                      onClick={() => toggleExpand(eid)}
                      className="w-full px-4 pb-3 text-left text-xs text-gray-400 touch-manipulation flex items-center gap-1"
                    >
                      <span className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>▾</span>
                      {expanded ? 'Hide details' : 'Show details'}
                    </button>
                    {expanded && (
                      <div className="px-4 pb-4">
                        <WorkoutDetail w={w} />
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}

            {plannedWorkout && (
              <div className="flex bg-gray-100 rounded-xl p-1 gap-1 mb-4">
                <button
                  onClick={() => setPlanTab('post')}
                  className={`flex-1 rounded-lg py-2.5 text-xs font-bold transition-colors touch-manipulation ${
                    planTab === 'post' ? 'bg-white text-gray-900 shadow-sm' : 'bg-transparent text-gray-500'
                  }`}
                >
                  Post draft
                </button>
                <button
                  onClick={() => setPlanTab('browse')}
                  className={`flex-1 rounded-lg py-2.5 text-xs font-bold transition-colors touch-manipulation ${
                    planTab === 'browse' ? 'bg-white text-gray-900 shadow-sm' : 'bg-transparent text-gray-500'
                  }`}
                >
                  Change workout
                </button>
              </div>
            )}

            {(!plannedWorkout || planTab === 'browse') && (
              <>
                <div className="relative mb-4">
                  <input
                    type="search"
                    value={pickerSearch}
                    onChange={e => setPickerSearch(e.target.value)}
                    placeholder="Search all workouts by name, type, race…"
                    className="w-full rounded-xl border border-gray-200 bg-white pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-orange-400"
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
                </div>

                {allSuggestions.length === 0 && !pickerSearch ? (
                  <p className="text-gray-400 italic text-sm">
                    {plannedWorkout
                      ? `No other ${entry.workoutType} workouts to switch to yet.`
                      : `No ${entry.workoutType} workouts in the library yet.`}
                  </p>
                ) : displayRows.length === 0 ? (
                  <p className="text-gray-400 italic text-sm">No workouts match your search.</p>
                ) : (
                  <div className="mb-6">
                    <div className="text-sm font-bold text-gray-700 mb-2">
                      {pickerSearch ? `All workouts matching "${pickerSearch}"` : 'Workouts — least recently used'}
                    </div>
                    <div className="flex flex-col gap-2">
                      {visibleRows.map(row => {
                        if (row.kind === 'standalone') {
                          const w = row.workout
                          const sel = isEffectivelySelected(w)
                          const eid = `s-${w.id}`
                          const expanded = expandedId === eid
                          return (
                            <div
                              key={`s-${w.id}`}
                              className={`bg-white rounded-2xl border shadow-sm transition-colors ${sel ? 'border-orange-400 ring-1 ring-orange-300' : 'border-gray-100'}`}
                            >
                              <button
                                onClick={() => handleSelect(w)}
                                className="w-full text-left p-4 touch-manipulation cursor-pointer"
                              >
                                <div className="flex justify-between items-start gap-2">
                                  <div className="font-semibold text-gray-900">{w.name}</div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <VoteBadge v={voteData[workoutVoteId(w.name, w.label ?? '')]} />
                                    <span className="text-xs text-gray-400">{w.lastRan ? formatDateShort(w.lastRan) : 'Never'}</span>
                                  </div>
                                </div>
                                {w.label && <div className="text-xs text-gray-400 mt-0.5">{w.label}</div>}
                                {w.rawInput && <div className="text-sm text-gray-700 mt-1.5 whitespace-pre-wrap leading-snug">{w.rawInput}</div>}
                                {w.coachingNotes && <div className="text-sm text-gray-500 mt-1.5 italic leading-snug">{w.coachingNotes}</div>}
                                <div className="text-xs text-gray-400 mt-2">{w.distTime}</div>
                              </button>
                              <button
                                onClick={() => toggleExpand(eid)}
                                className="w-full px-4 pb-3 text-left text-xs text-gray-400 touch-manipulation flex items-center gap-1"
                              >
                                <span className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>▾</span>
                                {expanded ? 'Hide details' : 'Show details'}
                              </button>
                              {expanded && (
                                <div className="px-4 pb-4">
                                  <WorkoutDetail w={w} />
                                </div>
                              )}
                            </div>
                          )
                        }

                        // Family row — all versions always visible, up to 2 selectable.
                        // Badge text is a generic ordinal ("Standard" / "Variation N of
                        // Total"), not driven by label — label is a short leader-authored
                        // tag ("Shorter"/"Longer"), shown as the subtitle beneath it.
                        return (
                          <div key={`f-${row.familyId}`} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                            <div className="px-4 py-3 border-b border-gray-100">
                              <div className="flex justify-between items-start gap-2">
                                <div className="font-semibold text-gray-900">{row.name}</div>
                                <span className="text-xs font-semibold bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full shrink-0">
                                  {row.total} versions
                                </span>
                              </div>
                            </div>
                            {row.variants.map((v, i) => {
                              const sel = isEffectivelySelected(v)
                              const isLast = i === row.variants.length - 1
                              const eid = `f-variant-${v.id}`
                              const expanded = expandedId === eid
                              const label = i === 0 ? 'Standard' : `Variation ${i + 1} of ${row.total}`
                              return (
                                <div key={v.id} className={`${!isLast ? 'border-b border-gray-50' : ''} ${sel ? 'bg-orange-50' : 'bg-white'}`}>
                                  <button
                                    onClick={() => handleSelect(v)}
                                    className="w-full text-left px-4 pt-3 pb-1 touch-manipulation"
                                  >
                                    <div className="flex justify-between items-start gap-2">
                                      <div className="flex items-center gap-2">
                                        <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${sel ? 'border-orange-500 bg-orange-500' : 'border-gray-300'}`} />
                                        <span className={`text-xs font-bold ${i === 0 ? 'text-gray-600' : 'text-orange-500'}`}>{label}</span>
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        <VoteBadge v={voteData[workoutVoteId(v.name, v.label ?? '')]} />
                                        <span className="text-xs text-gray-400">{v.lastRan ? formatDateShort(v.lastRan) : 'Never'}</span>
                                      </div>
                                    </div>
                                    {v.label && <div className="text-sm text-gray-700 mt-1 ml-6 leading-snug">{v.label}</div>}
                                    {v.rawInput && <div className="text-sm text-gray-700 mt-1.5 ml-6 whitespace-pre-wrap leading-snug">{v.rawInput}</div>}
                                    {v.coachingNotes && <div className="text-sm text-gray-500 mt-1.5 ml-6 italic leading-snug">{v.coachingNotes}</div>}
                                    {v.distTime && <div className="text-xs text-gray-400 mt-0.5 ml-6">{v.distTime}</div>}
                                  </button>
                                  <button onClick={() => toggleExpand(eid)} className="w-full px-4 pb-2 text-left text-xs text-gray-400 touch-manipulation flex items-center gap-1 ml-6">
                                    <span className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>▾</span>
                                    {expanded ? 'Hide' : 'Details'}
                                  </button>
                                  {expanded && <div className="px-4 pb-3"><WorkoutDetail w={v} /></div>}
                                </div>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                    {remainingCount > 0 && (
                      <button
                        onClick={() => setShowCount(showCount + 3)}
                        className="mt-3 w-full py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-500 bg-white active:bg-gray-50 touch-manipulation"
                      >
                        Show {Math.min(remainingCount, 3)} more
                      </button>
                    )}
                  </div>
                )}

                {effectiveSelections.length > 0 && (
                  <button
                    onClick={handleSetPlan}
                    disabled={saving || saved}
                    className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm mb-6 touch-manipulation transition-colors ${
                      saved
                        ? 'bg-green-500 text-white'
                        : 'bg-orange-500 text-white active:bg-orange-600 disabled:opacity-60'
                    }`}
                  >
                    {saved ? <><Check size={16} /> Saved to plan</> : saving ? 'Saving…' : 'Set as plan'}
                  </button>
                )}
              </>
            )}

            {(!plannedWorkout || planTab === 'post') && effectiveSelections.length > 0 && (
              <div>
                <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                  <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans leading-relaxed">{post}</pre>
                  <button
                    onClick={handleCopy}
                    data-tour="heylo-copy"
                    className={`mt-4 w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm transition-colors touch-manipulation cursor-pointer ${
                      copied ? 'bg-green-500 text-white' : 'bg-orange-500 text-white'
                    }`}
                  >
                    {copied ? <><Check size={16} /> Copied!</> : <><Copy size={16} /> Copy to clipboard</>}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
