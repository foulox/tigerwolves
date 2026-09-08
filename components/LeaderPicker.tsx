'use client'
import { useTransition } from 'react'
import * as Sentry from '@sentry/nextjs'
import { saveScheduleLeader } from '@/app/actions'
import type { RunLeader } from '@/lib/data'

type Props = {
  date: string
  currentLeader: string
  runLeaders: RunLeader[]
  onClose: () => void
  onSaved: (leader: string) => void
}

function isCurrentlyAway(leader: RunLeader, date: string): boolean {
  return leader.awayPeriods.some(p => p.from <= date && date <= p.to)
}

export default function LeaderPicker({ date, currentLeader, runLeaders, onClose, onSaved }: Props) {
  const [isPending, startTransition] = useTransition()

  function handleSelect(name: string) {
    startTransition(async () => {
      try {
        await saveScheduleLeader(date, name)
        onSaved(name)
        onClose()
      } catch (err) {
        Sentry.captureException(err)
      }
    })
  }

  const sorted = [...runLeaders].sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999))

  return (
    <div className="flex flex-col gap-2 px-4 pb-4">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide px-1">Who leads?</p>
      <div className="bg-white rounded-xl overflow-hidden shadow border border-gray-100">
        {sorted.map(l => {
          const away = isCurrentlyAway(l, date)
          const isSelected = l.name === currentLeader
          return (
            <button
              key={l.id}
              onClick={() => handleSelect(l.name)}
              disabled={isPending}
              aria-label={`Select ${l.name} as leader`}
              className={`w-full flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 touch-manipulation text-left ${isSelected ? 'bg-orange-50' : 'bg-white'}`}
            >
              <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">{l.name[0]}</div>
              <span className="flex-1 text-sm font-medium text-gray-900">{l.name}</span>
              {away && <span className="text-[9px] bg-yellow-50 text-yellow-700 font-bold px-1.5 py-0.5 rounded">Away</span>}
              {isSelected && <span className="text-orange-600 font-bold text-base">✓</span>}
            </button>
          )
        })}
      </div>
      <button onClick={onClose} className="text-sm text-gray-400 font-medium py-1 touch-manipulation">Cancel</button>
    </div>
  )
}
