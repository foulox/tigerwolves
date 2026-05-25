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

function buildPost(entry: ScheduleEntry, workout: Workout) {
  const lines = [
    '🐯🐺 TigerWolves Tuesday Workout',
    '',
    `📅 ${formatDateLong(entry.date)}`,
    `🏃🏻‍♂️‍➡️ ${entry.workoutType}: ${workout.name}`,
  ]

  if (workout.reason) {
    lines.push('', workout.reason)
  }

  lines.push(
    '',
    '📍 Starting point and route: Tom Stofka Garden, aka "Da Bins."',
    'We\'ll warm up by jogging to Marsha P. Johnson which is at the corner of North 8th and Kent',
    'The run will be along the Kent Avenue Speedway',
    'We\'ll finish up back at Marsha P. Johnson State Park and cool down with a jog to the track',
    '',
    formatMainSection(workout.instructions),
    '',
    computeTurnaround(workout.instructions),
    '',
    'Bag Drop: Sorry, Not available',
    '',
    `Led by ${entry.leader} — see you out there! 🔥`,
    `Run Leaders: ${RUN_LEADERS.join(', ')}`,
  )

  return lines.join('\n')
}

type Props = {
  upcoming: ScheduleEntry[]
  workouts: Workout[]
  initialWeekIndex?: number
}

export default function PlanClient({ upcoming, workouts, initialWeekIndex = 0 }: Props) {
  const [weekIndex, setWeekIndex] = useState(initialWeekIndex)
  const [selectedName, setSelectedName] = useState<string>('')
  const [showCount, setShowCount] = useState(3)
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const entry = upcoming[weekIndex]

  const allSuggestions = useMemo(() => {
    if (!entry) return []
    const types = entry.workoutType.split(' or ').map(t => t.trim())
    return workouts
      .filter(w => types.includes(w.type))
      .sort((a, b) => (a.lastRan ?? '0') < (b.lastRan ?? '0') ? -1 : 1)
  }, [entry, workouts])

  const visibleSuggestions = allSuggestions.slice(0, showCount)
  const remainingCount = allSuggestions.length - showCount

  const effectiveSelected = selectedName || entry?.workoutName || allSuggestions[0]?.name || ''

  function changeWeek(idx: number) {
    setWeekIndex(idx)
    setSelectedName('')
    setShowCount(3)
    setCopied(false)
    setSaved(false)
  }

  function handleSelect(name: string) {
    setSelectedName(name)
    setSaved(false)
  }

  const selected = allSuggestions.find(w => w.name === effectiveSelected)
  const post = selected && entry ? buildPost(entry, selected) : ''

  function handleCopy() {
    navigator.clipboard.writeText(post).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  async function handleSetPlan() {
    if (!entry || !effectiveSelected) return
    setSaving(true)
    try {
      await setPlanWorkout(entry.date, effectiveSelected)
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

          {allSuggestions.length === 0 ? (
            <p className="text-gray-400 italic text-sm">No {entry.workoutType} workouts in the library yet.</p>
          ) : (
            <div className="mb-6">
              <div className="text-sm font-bold text-gray-700 mb-2">Workouts — least recently used</div>
              <div className="flex flex-col gap-2">
                {visibleSuggestions.map(w => (
                  <button
                    key={w.name}
                    onClick={() => handleSelect(w.name)}
                    className={`text-left bg-white rounded-2xl p-4 border shadow-sm transition-colors touch-manipulation cursor-pointer ${effectiveSelected === w.name ? 'border-orange-400 ring-1 ring-orange-300' : 'border-gray-100'}`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="font-semibold text-gray-900">{w.name}</div>
                      <div className="text-xs text-gray-400 shrink-0">
                        {w.lastRan ? formatDateShort(w.lastRan) : 'Never'}
                      </div>
                    </div>
                    <div className="text-sm text-gray-500 mt-1 leading-snug">{w.reason}</div>
                    <div className="text-xs text-gray-400 mt-2">{w.distTime}</div>
                  </button>
                ))}
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

          {selected && (
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
