'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import type { ScheduleEntry, Workout } from '@/lib/data'

function formatDateLong(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

function formatDateShort(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function buildPost(leader: string, entry: ScheduleEntry, workout: Workout) {
  return `🐯🐺 TigerWolves Tuesday Workout

📅 ${formatDateLong(entry.date)}
🏃 ${entry.workoutType}: ${workout.name}

${workout.instructions}

📍 Meet at the usual spot, 6:30pm
👟 ~${workout.distTime}

Led by ${leader} — see you out there! 🔥`
}

type Props = {
  leader: string
  entry: ScheduleEntry
  suggestions: Workout[]
}

export default function MyWeekClient({ leader, entry, suggestions }: Props) {
  const [selectedName, setSelectedName] = useState<string>(suggestions[0]?.name ?? '')
  const [copied, setCopied] = useState(false)

  const selected = suggestions.find(w => w.name === selectedName)
  const post = selected ? buildPost(leader, entry, selected) : ''

  function handleCopy() {
    navigator.clipboard.writeText(post).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="px-4 pt-10 pb-4">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Week</h1>
        <p className="text-sm text-gray-500 mt-0.5">You&apos;re up {formatDateLong(entry.date)}</p>
      </header>

      <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 mb-6">
        <div className="text-xs font-bold text-orange-500 tracking-wide mb-1">WORKOUT TYPE</div>
        <div className="text-2xl font-bold text-gray-900">{entry.workoutType}</div>
      </div>

      {suggestions.length === 0 ? (
        <p className="text-gray-400 italic text-sm">No {entry.workoutType} workouts in the library yet.</p>
      ) : (
        <div className="mb-6">
          <div className="text-sm font-bold text-gray-700 mb-2">Suggested — least recently used</div>
          <div className="flex flex-col gap-2">
            {suggestions.map(w => (
              <button
                key={w.name}
                onClick={() => setSelectedName(w.name)}
                className={`text-left bg-white rounded-2xl p-4 border shadow-sm transition-colors touch-manipulation cursor-pointer ${selectedName === w.name ? 'border-orange-400 ring-1 ring-orange-300' : 'border-gray-100'}`}
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
    </div>
  )
}
