'use client'

import { useState, useMemo } from 'react'
import { Copy, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { RUN_LEADERS } from '@/lib/data'
import type { ScheduleEntry, Workout } from '@/lib/data'
import { setPlanWorkout } from '@/app/actions'

function formatDateLong(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

function formatDateShort(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function ordinal(n: number): string {
  if (n === 1) return '1st'
  if (n === 2) return '2nd'
  if (n === 3) return '3rd'
  return `${n}th`
}

function toSeconds(val: string, unit: string): number {
  return parseInt(val) * (unit.toLowerCase().startsWith('min') ? 60 : 1)
}

function splitRespectParens(str: string, sep: string): string[] {
  const result: string[] = []
  let depth = 0, cur = '', i = 0
  while (i < str.length) {
    if (str[i] === '(') depth++
    else if (str[i] === ')') depth--
    if (depth === 0 && str.slice(i, i + sep.length) === sep) {
      result.push(cur); cur = ''; i += sep.length; continue
    }
    cur += str[i++]
  }
  result.push(cur)
  return result
}

type Rep = { seconds: number; repNum: number; groupSize: number; groupLabel: string }

function expandToken(token: string): Rep[] | null {
  const t = token.trim().replace(/\.$/, '')

  const nested = t.match(/^(\d+)[×x]\((.+?)\)/)
  if (nested) {
    const n = parseInt(nested[1])
    let perRep = 0
    for (const p of nested[2].split('/')) {
      const m = p.trim().match(/(\d+)\s*(min|s)/i)
      if (!m) return null
      perRep += toSeconds(m[1], m[2])
    }
    return Array.from({ length: n }, (_, i) => ({
      seconds: perRep, repNum: i + 1, groupSize: n, groupLabel: nested[2].trim(),
    }))
  }

  const sets = t.match(/^(\d+)\s+sets?\s+of\s*\((.+)\)/i)
  if (sets) {
    const n = parseInt(sets[1])
    let perSet = 0
    for (const p of sets[2].split('/')) {
      const m = p.trim().match(/(\d+)\s*(min|s)/i)
      if (m) perSet += toSeconds(m[1], m[2])
    }
    return Array.from({ length: n }, (_, i) => ({
      seconds: perSet, repNum: i + 1, groupSize: n, groupLabel: `set ${i + 1}`,
    }))
  }

  const multi = t.match(/^(\d+)\s*[×x]\s*(\d+)\s*(min|s)/i)
  if (multi) {
    const n = parseInt(multi[1])
    const d = toSeconds(multi[2], multi[3])
    return Array.from({ length: n }, (_, i) => ({
      seconds: d, repNum: i + 1, groupSize: n, groupLabel: t,
    }))
  }

  const single = t.match(/^(\d+)\s*(min|s)/i)
  if (single) {
    return [{ seconds: toSeconds(single[1], single[2]), repNum: 1, groupSize: 1, groupLabel: t }]
  }

  return null
}

function extractMain(instructions: string): string | null {
  const mainIdx = instructions.indexOf('Main:')
  if (mainIdx === -1) return null
  const afterMain = instructions.slice(mainIdx + 5).trim()
  const cdMatch = afterMain.match(/\.\s*CD:|\s+CD:/i)
  return (cdMatch ? afterMain.slice(0, cdMatch.index) : afterMain).trim()
}

function computeTurnaround(instructions: string): string {
  const mainPart = extractMain(instructions)
  if (!mainPart) return '↩️ TURN AROUND: [add before posting]'

  const tokens = mainPart.includes(' + ')
    ? mainPart.split(' + ')
    : splitRespectParens(mainPart, ' / ')

  const allReps: Rep[] = []
  for (const token of tokens) {
    const reps = expandToken(token)
    if (!reps) return '↩️ TURN AROUND: [add before posting]'
    allReps.push(...reps)
  }

  const halfway = allReps.reduce((s, r) => s + r.seconds, 0) / 2
  let cumulative = 0

  for (const rep of allReps) {
    cumulative += rep.seconds
    if (cumulative >= halfway) {
      if (rep.groupSize > 1 && rep.groupLabel.startsWith('set ')) {
        return `↩️ TURN AROUND: After ${rep.groupLabel}`
      } else if (rep.groupSize > 1) {
        return `↩️ TURN AROUND: After the ${ordinal(rep.repNum)} rep of the ${rep.groupLabel}`
      } else {
        return `↩️ TURN AROUND: After the ${rep.groupLabel}`
      }
    }
  }

  return '↩️ TURN AROUND: [add before posting]'
}

function formatMainSection(instructions: string): string {
  const mainPart = extractMain(instructions)
  if (!mainPart) return `🏁🏃🏻‍♂️‍➡️ WORKOUT 🏃🏻‍♂️‍➡️🏁\n${instructions}`

  let formatted: string
  if (mainPart.includes(' + ')) {
    formatted = mainPart.replace(/\s*\+\s*/g, ' +\n')
  } else {
    formatted = splitRespectParens(mainPart, ' / ').join(' /\n')
  }

  return `🏁🏃🏻‍♂️‍➡️ WORKOUT 🏃🏻‍♂️‍➡️🏁\n${formatted}`
}

function formatMainContent(instructions: string): string {
  const mainPart = extractMain(instructions)
  if (!mainPart) return instructions
  if (mainPart.includes(' + ')) return mainPart.replace(/\s*\+\s*/g, ' +\n')
  return splitRespectParens(mainPart, ' / ').join(' /\n')
}

function buildPost(entry: ScheduleEntry, selections: Workout[]) {
  const sorted = [...selections].sort((a, b) => (a.progression ?? 0) - (b.progression ?? 0))
  const primary = sorted[0]

  const lines = [
    '🐯🐺 TigerWolves Tuesday Workout',
    '',
    `📅 ${formatDateLong(entry.date)}`,
    `🏃🏻‍♂️‍➡️ ${entry.workoutType}: ${primary.name}`,
  ]

  if (primary.reason) lines.push('', primary.reason)

  lines.push(
    '',
    '📍 Starting point and route: Tom Stofka Garden, aka "Da Bins."',
    'We\'ll warm up by jogging to Marsha P. Johnson which is at the corner of North 8th and Kent',
    'The run will be along the Kent Avenue Speedway',
    'We\'ll finish up back at Marsha P. Johnson State Park and cool down with a jog to the track',
    '',
  )

  if (sorted.length === 2) {
    const [standard, longer] = sorted
    const stdContent = standard.variation || formatMainContent(standard.instructions)
    const lngContent = longer.variation || formatMainContent(longer.instructions)
    lines.push(
      '🏁🏃🏻‍♂️‍➡️ WORKOUT 🏃🏻‍♂️‍➡️🏁',
      '',
      'Standard',
      stdContent,
      computeTurnaround(standard.instructions),
      '',
      'Longer',
      lngContent,
      computeTurnaround(longer.instructions),
    )
  } else {
    const w = sorted[0]
    lines.push(
      w.variation ? `🏁🏃🏻‍♂️‍➡️ WORKOUT 🏃🏻‍♂️‍➡️🏁\n${w.variation}` : formatMainSection(w.instructions),
      '',
      computeTurnaround(w.instructions),
    )
  }

  lines.push(
    '',
    'Bag Drop: Sorry, Not available',
    '',
    `Led by ${entry.leader} — see you out there! 🔥`,
    `Run Leaders: ${RUN_LEADERS.join(', ')}`,
  )

  return lines.join('\n')
}

type PlanStandaloneRow = { kind: 'standalone'; workout: Workout }
type PlanFamilyRow = { kind: 'family'; name: string; base: Workout | null; progressions: Workout[]; total: number }
type PlanDisplayRow = PlanStandaloneRow | PlanFamilyRow

function WorkoutDetail({ w, isLeader }: { w: Workout; isLeader: boolean }) {
  return (
    <div className="mt-3 pt-3 border-t border-gray-100 space-y-2 text-sm text-gray-600">
      {w.instructions && (
        <p className="whitespace-pre-wrap leading-snug">{w.instructions}</p>
      )}
      {w.lapStructure && (
        <p className="text-xs text-gray-500"><span className="font-semibold">Laps:</span> {w.lapStructure}</p>
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
      {w.coachingNotes && (
        <p className="text-xs text-gray-500 italic">{w.coachingNotes}</p>
      )}
      <div className="flex items-center justify-between pt-1">
        {w.mapLink ? (
          <a href={w.mapLink} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-blue-500 touch-manipulation">
            Map ↗
          </a>
        ) : <span />}
        {isLeader && (
          <a
            href={`/library/edit?name=${encodeURIComponent(w.name)}&variation=${encodeURIComponent(w.variation)}`}
            className="text-xs font-semibold text-orange-500 touch-manipulation"
          >
            Edit
          </a>
        )}
      </div>
    </div>
  )
}

type Props = {
  upcoming: ScheduleEntry[]
  workouts: Workout[]
  initialWeekIndex?: number
  isLeader: boolean
}

export default function PlanClient({ upcoming, workouts, initialWeekIndex = 0, isLeader }: Props) {
  const [weekIndex, setWeekIndex] = useState(initialWeekIndex)
  const [selectedWorkouts, setSelectedWorkouts] = useState<Workout[]>([])
  const [showCount, setShowCount] = useState(3)
  const [pickerSearch, setPickerSearch] = useState('')
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const entry = upcoming[weekIndex]

  const familyNames = useMemo(() => {
    const s = new Set<string>()
    for (const w of workouts) {
      if (w.variation) s.add(w.name)
    }
    return s
  }, [workouts])

  const allSuggestions = useMemo(() => {
    if (!entry) return []
    const types = entry.workoutType.split(' or ').map(t => t.trim())
    return workouts
      .filter(w => types.includes(w.type))
      .sort((a, b) => (a.lastRan ?? '0') < (b.lastRan ?? '0') ? -1 : 1)
  }, [entry, workouts])

  const pickerSource = useMemo(() => {
    const q = pickerSearch.toLowerCase()
    if (!q) return allSuggestions
    return workouts
      .filter(w =>
        w.name.toLowerCase().includes(q) ||
        w.type.toLowerCase().includes(q) ||
        w.variation.toLowerCase().includes(q) ||
        w.reason.toLowerCase().includes(q) ||
        w.raceTypes.some(r => r.toLowerCase().includes(q))
      )
      .sort((a, b) => (a.lastRan ?? '0') < (b.lastRan ?? '0') ? -1 : 1)
  }, [pickerSearch, allSuggestions, workouts])

  const displayRows = useMemo<PlanDisplayRow[]>(() => {
    const rows: PlanDisplayRow[] = []
    const seen = new Set<string>()
    for (const w of pickerSource) {
      if (!familyNames.has(w.name)) {
        rows.push({ kind: 'standalone', workout: w })
      } else if (!seen.has(w.name)) {
        seen.add(w.name)
        const allMembers = pickerSource.filter(p => p.name === w.name)
        const base = allMembers.find(p => !p.variation) ?? null
        const progressions = allMembers
          .filter(p => p.variation)
          .sort((a, b) => (a.progression ?? 0) - (b.progression ?? 0))
        rows.push({ kind: 'family', name: w.name, base, progressions, total: (base ? 1 : 0) + progressions.length })
      }
    }
    return rows
  }, [pickerSource, familyNames])

  const visibleRows = pickerSearch ? displayRows : displayRows.slice(0, showCount)
  const remainingCount = pickerSearch ? 0 : displayRows.length - showCount

  const effectiveSelections: Workout[] = selectedWorkouts.length > 0
    ? selectedWorkouts
    : (() => {
        const planned = entry?.workoutName
          ? allSuggestions.find(w => w.name === entry.workoutName) ?? null
          : null
        const w = planned ?? allSuggestions[0] ?? null
        return w ? [w] : []
      })()

  function workoutKey(w: Workout) {
    return `${w.name}||${w.progression ?? ''}`
  }

  function isEffectivelySelected(w: Workout): boolean {
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
  }

  function toggleExpand(id: string) {
    setExpandedId(prev => prev === id ? null : id)
  }

  function handleSelect(w: Workout) {
    setSelectedWorkouts(prev => {
      const key = workoutKey(w)
      if (prev.some(s => workoutKey(s) === key)) {
        return prev.filter(s => workoutKey(s) !== key)
      }
      if (prev.length === 2 && prev[0].name === w.name) {
        return prev
      }
      if (prev.length === 1 && prev[0].name === w.name) {
        return [prev[0], w]
      }
      return [w]
    })
    setSaved(false)
  }

  const post = entry && effectiveSelections.length > 0 ? buildPost(entry, effectiveSelections) : ''

  function handleCopy() {
    navigator.clipboard.writeText(post).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  async function handleSetPlan() {
    if (!entry || effectiveSelections.length === 0) return
    const sorted = [...effectiveSelections].sort((a, b) => (a.progression ?? 0) - (b.progression ?? 0))
    setSaving(true)
    try {
      await setPlanWorkout(entry.date, sorted[0].name)
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  if (upcoming.length === 0) {
    return (
      <div className="px-4 pt-10">
        <h1 className="text-2xl font-bold text-gray-900">Plan</h1>
        <p className="text-gray-500 mt-4">No upcoming weeks on the schedule.</p>
      </div>
    )
  }

  return (
    <div className="px-4 pt-10 pb-4">
      <header className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Plan</h1>
      </header>

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
            <div className="text-2xl font-bold text-gray-900">{entry.workoutType}</div>
            <div className="text-xs text-gray-400 mt-1">{formatDateLong(entry.date)}</div>
          </div>

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
            <p className="text-gray-400 italic text-sm">No {entry.workoutType} workouts in the library yet.</p>
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
                    const eid = `s-${w.name}-${w.variation}`
                    const expanded = expandedId === eid
                    return (
                      <div
                        key={`s-${w.name}`}
                        className={`bg-white rounded-2xl border shadow-sm transition-colors ${sel ? 'border-orange-400 ring-1 ring-orange-300' : 'border-gray-100'}`}
                      >
                        <button
                          onClick={() => handleSelect(w)}
                          className="w-full text-left p-4 touch-manipulation cursor-pointer"
                        >
                          <div className="flex justify-between items-start gap-2">
                            <div className="font-semibold text-gray-900">{w.name}</div>
                            <div className="text-xs text-gray-400 shrink-0">
                              {w.lastRan ? formatDateShort(w.lastRan) : 'Never'}
                            </div>
                          </div>
                          {w.variation && <div className="text-xs text-gray-400 mt-0.5">{w.variation}</div>}
                          <div className="text-sm text-gray-500 mt-1 leading-snug">{w.reason}</div>
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
                            <WorkoutDetail w={w} isLeader={isLeader} />
                          </div>
                        )}
                      </div>
                    )
                  }

                  // Family row — all versions always visible, up to 2 selectable
                  return (
                    <div key={`f-${row.name}`} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-100">
                        <div className="flex justify-between items-start gap-2">
                          <div className="font-semibold text-gray-900">{row.name}</div>
                          <span className="text-xs font-semibold bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full shrink-0">
                            {row.total} versions
                          </span>
                        </div>
                      </div>
                      {row.base && (() => {
                        const eid = `f-base-${row.name}`
                        const expanded = expandedId === eid
                        return (
                          <div className={`border-b border-gray-50 ${isEffectivelySelected(row.base) ? 'bg-orange-50' : 'bg-white'}`}>
                            <button
                              onClick={() => handleSelect(row.base!)}
                              className="w-full text-left px-4 pt-3 pb-1 touch-manipulation"
                            >
                              <div className="flex justify-between items-start gap-2">
                                <div className="flex items-center gap-2">
                                  <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${isEffectivelySelected(row.base) ? 'border-orange-500 bg-orange-500' : 'border-gray-300'}`} />
                                  <span className="text-xs font-bold text-gray-600">Standard</span>
                                </div>
                                <span className="text-xs text-gray-400">{row.base.lastRan ? formatDateShort(row.base.lastRan) : 'Never'}</span>
                              </div>
                              {row.base.distTime && <div className="text-xs text-gray-400 mt-1 ml-6">{row.base.distTime}</div>}
                            </button>
                            <button onClick={() => toggleExpand(eid)} className="w-full px-4 pb-2 text-left text-xs text-gray-400 touch-manipulation flex items-center gap-1 ml-6">
                              <span className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>▾</span>
                              {expanded ? 'Hide' : 'Details'}
                            </button>
                            {expanded && <div className="px-4 pb-3"><WorkoutDetail w={row.base} isLeader={isLeader} /></div>}
                          </div>
                        )
                      })()}
                      {row.progressions.map((p, i) => {
                        const sel = isEffectivelySelected(p)
                        const isLast = i === row.progressions.length - 1
                        const eid = `f-prog-${row.name}-${p.progression}`
                        const expanded = expandedId === eid
                        return (
                          <div key={p.progression ?? i} className={`${!isLast ? 'border-b border-gray-50' : ''} ${sel ? 'bg-orange-50' : 'bg-white'}`}>
                            <button
                              onClick={() => handleSelect(p)}
                              className="w-full text-left px-4 pt-3 pb-1 touch-manipulation"
                            >
                              <div className="flex justify-between items-start gap-2">
                                <div className="flex items-center gap-2">
                                  <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${sel ? 'border-orange-500 bg-orange-500' : 'border-gray-300'}`} />
                                  <span className="text-xs font-bold text-orange-500">Variation {p.progression} of {row.total}</span>
                                </div>
                                <span className="text-xs text-gray-400">{p.lastRan ? formatDateShort(p.lastRan) : 'Never'}</span>
                              </div>
                              {p.variation && <div className="text-sm text-gray-700 mt-1 ml-6 leading-snug">{p.variation}</div>}
                              {p.distTime && <div className="text-xs text-gray-400 mt-0.5 ml-6">{p.distTime}</div>}
                            </button>
                            <button onClick={() => toggleExpand(eid)} className="w-full px-4 pb-2 text-left text-xs text-gray-400 touch-manipulation flex items-center gap-1 ml-6">
                              <span className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>▾</span>
                              {expanded ? 'Hide' : 'Details'}
                            </button>
                            {expanded && <div className="px-4 pb-3"><WorkoutDetail w={p} isLeader={isLeader} /></div>}
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
            <>
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

              <div>
                <div className="text-sm font-bold text-gray-700 mb-2">Heylo post draft</div>
                <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                  <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans leading-relaxed">{post}</pre>
                  <button
                    onClick={handleCopy}
                    className={`mt-4 w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm transition-colors touch-manipulation cursor-pointer ${
                      copied ? 'bg-green-500 text-white' : 'bg-orange-500 text-white'
                    }`}
                  >
                    {copied ? <><Check size={16} /> Copied!</> : <><Copy size={16} /> Copy to clipboard</>}
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
