'use client'

import { useState, useMemo } from 'react'
import { Copy, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import type { ScheduleEntry, Workout } from '@/lib/data'

function formatDateLong(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

function formatDateShort(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function buildPost(entry: ScheduleEntry, workout: Workout) {
  const workoutLabel = workout.variation
    ? `${workout.name}\n${workout.variation}`
    : workout.name
  return `🐯🐺 TigerWolves Tuesday Workout

📅 ${formatDateLong(entry.date)}
🏃 ${entry.workoutType}: ${workoutLabel}

${workout.instructions}

📍 Meet at the usual spot, 6:30pm
👟 ~${workout.distTime}

Led by ${entry.leader} — see you out there! 🔥`
}

type Props = {
  upcoming: ScheduleEntry[]
  workouts: Workout[]
  initialWeekIndex?: number
}

export default function MyWeekClient({ upcoming, workouts, initialWeekIndex = 0 }: Props) {
  const [weekIndex, setWeekIndex] = useState(initialWeekIndex)
  const [copied, setCopied] = useState(false)
  const [selectedName, setSelectedName] = useState<string>('')
  const [selectedProgression, setSelectedProgression] = useState<number | null>(null)

  const entry = upcoming[weekIndex]

  const suggestions = useMemo(() => {
    if (!entry) return []
    const types = entry.workoutType.split(' or ').map(t => t.trim())
    const matching = workouts
      .filter(w => types.includes(w.type))
      .sort((a, b) => (a.lastRan ?? '0') < (b.lastRan ?? '0') ? -1 : 1)
    // Deduplicate by name so variation families appear once
    const seen = new Set<string>()
    return matching.filter(w => {
      if (seen.has(w.name)) return false
      seen.add(w.name)
      return true
    }).slice(0, 3)
  }, [entry, workouts])

  const effectiveSelected = selectedName || suggestions[0]?.name || ''

  // All progressions for the selected workout family (sorted)
  const progressions = useMemo(() =>
    workouts
      .filter(w => w.name === effectiveSelected && w.variation)
      .sort((a, b) => (a.progression ?? 0) - (b.progression ?? 0))
  , [workouts, effectiveSelected])

  const effectiveProgression = selectedProgression ?? progressions[0]?.progression ?? null

  // The specific workout object to use for the post
  const selected = progressions.length > 0
    ? progressions.find(w => w.progression === effectiveProgression) ?? progressions[0]
    : suggestions.find(w => w.name === effectiveSelected) ?? null

  const post = selected && entry ? buildPost(entry, selected) : ''

  function changeWeek(idx: number) {
    setWeekIndex(idx)
    setSelectedName('')
    setSelectedProgression(null)
    setCopied(false)
  }

  function selectWorkout(name: string) {
    setSelectedName(name)
    setSelectedProgression(null)
    setCopied(false)
  }

  function handleCopy() {
    navigator.clipboard.writeText(post).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (upcoming.length === 0) {
    return (
      <div className="px-4 pt-10">
        <h1 className="text-2xl font-bold text-gray-900">My Week</h1>
        <p className="text-gray-500 mt-4">No upcoming weeks on the schedule.</p>
      </div>
    )
  }

  return (
    <div className="px-4 pt-10 pb-4">
      <header className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">My Week</h1>
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

          {suggestions.length === 0 ? (
            <p className="text-gray-400 italic text-sm">No {entry.workoutType} workouts in the library yet.</p>
          ) : (
            <div className="mb-6">
              <div className="text-sm font-bold text-gray-700 mb-2">Suggested — least recently used</div>
              <div className="flex flex-col gap-2">
                {suggestions.map(w => {
                  const isSelected = effectiveSelected === w.name
                  const wProgressions = workouts
                    .filter(p => p.name === w.name && p.variation)
                    .sort((a, b) => (a.progression ?? 0) - (b.progression ?? 0))
                  const hasProgressions = wProgressions.length > 0

                  return (
                    <div key={w.name}>
                      <button
                        onClick={() => selectWorkout(w.name)}
                        className={`w-full text-left bg-white rounded-2xl p-4 border shadow-sm transition-colors touch-manipulation cursor-pointer ${isSelected ? 'border-orange-400 ring-1 ring-orange-300' : 'border-gray-100'}`}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div className="font-semibold text-gray-900">{w.name}</div>
                          <div className="flex items-center gap-2 shrink-0">
                            {hasProgressions && (
                              <span className="text-xs font-semibold bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">
                                {wProgressions.length} progressions
                              </span>
                            )}
                            <div className="text-xs text-gray-400">
                              {w.lastRan ? formatDateShort(w.lastRan) : 'Never'}
                            </div>
                          </div>
                        </div>
                        {!hasProgressions && (
                          <>
                            <div className="text-sm text-gray-500 mt-1 leading-snug">{w.reason}</div>
                            <div className="text-xs text-gray-400 mt-2">{w.distTime}</div>
                          </>
                        )}
                        {hasProgressions && (
                          <div className="text-xs text-gray-400 mt-1">{w.reason}</div>
                        )}
                      </button>

                      {/* Progression picker — shown inline when this card is selected */}
                      {isSelected && hasProgressions && (
                        <div className="mt-1 ml-2 flex flex-col gap-1">
                          {wProgressions.map(p => (
                            <button
                              key={p.progression}
                              onClick={() => { setSelectedProgression(p.progression); setCopied(false) }}
                              className={`text-left px-4 py-3 rounded-xl border transition-colors touch-manipulation ${
                                effectiveProgression === p.progression
                                  ? 'bg-orange-50 border-orange-300'
                                  : 'bg-white border-gray-100'
                              }`}
                            >
                              <div className="text-xs font-bold text-orange-500 mb-0.5">P{p.progression}</div>
                              <div className="text-sm font-semibold text-gray-800">{p.variation}</div>
                              {p.distTime && <div className="text-xs text-gray-400 mt-0.5">{p.distTime}</div>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {selected && (
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
          )}
        </>
      )}
    </div>
  )
}
