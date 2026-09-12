'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { MyWeekItem } from '@/lib/myWeek'
import { feedWindow, groupByDay, weekStripCells } from '@/lib/myWeek'
import { workoutVoteId } from '@/lib/votes'
import type { VoteData } from '@/lib/votes'
import MyWeekCard from '@/components/MyWeekCard'

// #331 My Week feed. The server pre-fetches a broad range of followed-run entries;
// this component owns the visible week (a ±-week offset) and filters/groups client
// side so the date strip pages without an auth round-trip per nav.
export default function MyWeekClient({
  items,
  today,
  voteData,
}: {
  items: MyWeekItem[]
  today: string
  voteData: Record<string, VoteData | null>
}) {
  const [offset, setOffset] = useState(0)

  const { start, end } = feedWindow(today, offset)
  const visible = items.filter(i => i.date >= start && i.date <= end)
  const groups = groupByDay(visible, today)
  const cells = weekStripCells(today, offset)
  const datesWithItems = new Set(items.map(i => i.date))

  const rangeLabel = `${cells[0].weekdayShort} ${cells[0].dayNum} – ${cells[6].weekdayShort} ${cells[6].dayNum}`

  function voteFor(item: MyWeekItem): VoteData | null {
    if (!item.workout) return null
    return voteData[workoutVoteId(item.workout.name, item.workout.label ?? '')] ?? null
  }

  return (
    <div className="flex flex-col gap-3 px-4">
      {/* Date strip — week navigation moves the whole cross-run view ±7 days. */}
      <div className="flex items-center gap-2" data-testid="week-strip">
        <button
          onClick={() => setOffset(o => o - 1)}
          aria-label="Previous week"
          data-testid="week-prev"
          className="shrink-0 rounded-full p-1.5 text-gray-500 active:bg-gray-100 touch-manipulation"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex flex-1 justify-between gap-1">
          {cells.map(c => (
            <div
              key={c.date}
              data-testid={`week-cell-${c.date}`}
              className={`flex flex-1 flex-col items-center rounded-xl py-1.5 ${c.isToday ? 'bg-orange-500 text-white' : 'text-gray-600'}`}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide">{c.weekdayShort}</span>
              <span className="text-sm font-bold">{c.dayNum}</span>
              <span
                className={`mt-0.5 h-1 w-1 rounded-full ${
                  datesWithItems.has(c.date) ? (c.isToday ? 'bg-white' : 'bg-orange-400') : 'bg-transparent'
                }`}
              />
            </div>
          ))}
        </div>
        <button
          onClick={() => setOffset(o => o + 1)}
          aria-label="Next week"
          data-testid="week-next"
          className="shrink-0 rounded-full p-1.5 text-gray-500 active:bg-gray-100 touch-manipulation"
        >
          <ChevronRight size={20} />
        </button>
      </div>
      <div className="-mt-1 text-center text-xs font-semibold text-gray-400" data-testid="week-range-label">
        {rangeLabel}
      </div>

      {groups.length === 0 ? (
        <p className="py-6 text-center text-sm italic text-gray-400" data-testid="my-week-empty-week">
          Nothing scheduled across your runs this week.
        </p>
      ) : (
        groups.map(group => (
          <section key={group.date} data-testid={`day-group-${group.date}`} className="flex flex-col gap-2">
            <div className="px-1 pt-1 text-xs font-bold uppercase tracking-wide text-gray-400">
              {group.label} · {cellDate(group.date)}
            </div>
            {group.items.map(item => (
              <MyWeekCard key={`${item.run.id}-${item.date}`} item={item} voteData={voteFor(item)} />
            ))}
          </section>
        ))
      )}
    </div>
  )
}

// Short "Sep 15" style date for the day-group eyebrow (the day label already says
// Today/Tomorrow/weekday, so this just adds the calendar date).
function cellDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}
