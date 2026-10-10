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
      <p className="text-[10px] font-bold text-muted uppercase tracking-wide px-1">Who leads?</p>
      <div className="bg-card rounded-xl overflow-hidden shadow border border-line">
        {sorted.map(l => {
          const away = isCurrentlyAway(l, date)
          const isSelected = l.name === currentLeader
          return (
            <button
              key={l.id}
              onClick={() => handleSelect(l.name)}
              disabled={isPending}
              aria-label={`Select ${l.name} as leader`}
              className={`w-full flex items-center gap-3 px-4 py-3 border-b border-line last:border-0 touch-manipulation text-left ${isSelected ? 'bg-surface' : 'bg-card'}`}
            >
              <div className="w-7 h-7 rounded-full bg-surface flex items-center justify-center text-xs font-bold text-muted shrink-0">{l.name[0]}</div>
              <span className="flex-1 text-sm font-medium text-ink">{l.name}</span>
              {away && <span className="text-[9px] bg-surface text-muted border border-line font-bold px-1.5 py-0.5 rounded">Away</span>}
              {isSelected && <span className="text-accent font-bold text-base">✓</span>}
            </button>
          )
        })}
      </div>
      <button onClick={onClose} className="text-sm text-muted font-medium py-1 touch-manipulation">Cancel</button>
    </div>
  )
}
