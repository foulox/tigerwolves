'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  SERIES, DEMO_WEEK, WEEK_CONTENT, DEFAULT_JOINED, RUNNER_JOINED_KEY, DAY_ORDER, DAY_LABEL,
  type RunId, type RunSeries,
} from '@/lib/demoRunnerData'

// Day strip cell
function StripCell({ day, date, isToday, isPast, hasRun }: {
  day: string; date: string; isToday: boolean; isPast: boolean; hasRun: boolean
}) {
  const dotColor = isToday ? 'bg-orange-400' : isPast ? 'bg-gray-300' : hasRun ? 'bg-purple-400' : 'bg-transparent'
  return (
    <div className={`flex-1 rounded-2xl py-2 flex flex-col items-center gap-1.5 ${isToday ? 'bg-gray-900' : 'bg-white border border-gray-100'}`}>
      <span className={`text-[10.5px] font-bold ${isToday ? 'text-gray-400' : 'text-gray-400'}`}>{day[0].toUpperCase()}</span>
      <span className={`text-sm font-bold ${isToday ? 'text-white' : isPast ? 'text-gray-400' : 'text-gray-900'}`}>{date}</span>
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
    </div>
  )
}

// Compact row for runs that aren't today
function RunRow({ series, isNext, isPast, expanded, onToggle }: {
  series: RunSeries; isNext: boolean; isPast: boolean; expanded: boolean; onToggle: () => void
}) {
  const content = WEEK_CONTENT[series.id]
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className={`text-[11px] font-bold tracking-widest uppercase ${isPast ? 'text-gray-400' : isNext ? 'text-orange-500' : 'text-gray-500'}`}>
          {isNext ? 'NEXT UP' : series.dayName}
          {isPast && ' · DONE'}
        </span>
        <span className="flex-1 h-px bg-gray-100" />
      </div>
      <button
        onClick={onToggle}
        className={`w-full text-left rounded-2xl border px-4 py-3.5 flex gap-3 items-center touch-manipulation transition-colors ${isPast ? 'bg-gray-50 border-gray-200 opacity-80' : `bg-white ${series.border}`}`}
      >
        <span className={`w-1 self-stretch min-h-[34px] rounded-full flex-none ${series.bar}`} />
        <div className="flex-1 min-w-0">
          <div className={`text-[17px] font-bold leading-tight tracking-tight ${isPast ? 'text-[#8b8f97]' : 'text-gray-900'}`}>
            {series.name}
          </div>
          <div className={`text-[12.5px] ${isPast ? 'text-gray-400' : 'text-gray-500'}`}>
            {content.title} · {series.time}
          </div>
        </div>
        <span className={`text-[11.5px] font-semibold rounded-full px-2.5 py-1 whitespace-nowrap flex-none ${isPast ? 'bg-gray-100 text-gray-400' : `${series.pillBg} ${series.pillText}`}`}>
          {series.distance}
        </span>
      </button>

      {expanded && (
        <div className={`rounded-2xl border px-4 py-3 flex flex-col gap-2 ${isPast ? 'bg-gray-50 border-gray-200' : `bg-white ${series.border}`}`}>
          {content.lines?.map(([label, value]) => (
            <p key={label} className="text-sm leading-relaxed">
              <span className="font-bold text-gray-900">{label}</span>
              <span className="text-gray-600">{value}</span>
            </p>
          ))}
          {content.prose && (
            <p className="text-sm leading-relaxed text-gray-600">{content.prose}</p>
          )}
          {content.tags && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {content.tags.map((tag, i) => (
                <span key={tag} className={`text-xs font-semibold rounded-full px-2.5 py-1 ${i === 0 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>
                  {tag}
                </span>
              ))}
            </div>
          )}
          <div className="pt-2 border-t border-gray-100 flex justify-between items-center">
            <span className="text-[13px] text-gray-400">{series.leaders}</span>
            {series.id === 'doves' ? (
              <Link href="/runner/run/mourning-doves" className="text-[12.5px] font-bold text-orange-600">
                See all Mourning Doves →
              </Link>
            ) : series.id === 'tigerwolves' ? (
              <Link href="/" className="text-[12.5px] font-bold text-orange-600">
                See all TigerWolves →
              </Link>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}

// The big hero card for today's run
function TodayCard({ series, expanded, onToggle }: { series: RunSeries; expanded: boolean; onToggle: () => void }) {
  const content = WEEK_CONTENT[series.id]
  return (
    <button
      onClick={onToggle}
      className={`w-full text-left rounded-2xl border bg-white px-4 py-4 flex flex-col gap-2.5 shadow-sm touch-manipulation ${series.border}`}
    >
      <div className="flex justify-between items-start gap-2.5">
        <div className="min-w-0 flex flex-col gap-1">
          <div className="text-[11px] font-bold tracking-wide text-orange-500">
            TODAY · {series.dayName} · {series.time.toUpperCase()}
          </div>
          <div className="text-[22px] font-extrabold leading-tight tracking-tight text-gray-900">
            {series.name}
          </div>
          <div className="text-[13px] text-gray-500">{content.title} · {series.place}</div>
        </div>
        <span className={`text-xs font-semibold rounded-full px-2.5 py-1 whitespace-nowrap flex-none ${series.pillBg} ${series.pillText}`}>
          {series.pillLabel}
        </span>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 pt-3 flex flex-col gap-2">
          {content.lines?.map(([label, value]) => (
            <p key={label} className="text-[14.5px] leading-relaxed">
              <span className="font-bold text-gray-900">{label}</span>
              <span className="text-gray-600">{value}</span>
            </p>
          ))}
          {content.prose && (
            <p className="text-[14.5px] leading-relaxed text-gray-600">{content.prose}</p>
          )}
          {content.tags && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {content.tags.map((tag, i) => (
                <span key={tag} className={`text-xs font-semibold rounded-full px-2.5 py-1 ${i === 0 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>
                  {tag}
                </span>
              ))}
            </div>
          )}
          <div className="pt-2 border-t border-gray-100 flex justify-between items-center">
            <span className="text-[13px] text-gray-400">{series.leaders}</span>
            {series.id === 'tigerwolves' && (
              <Link href="/" className="text-[12.5px] font-bold text-orange-600" onClick={e => e.stopPropagation()}>
                See all TigerWolves →
              </Link>
            )}
          </div>
        </div>
      )}
    </button>
  )
}

export default function RunnerWeekPage() {
  const [joined, setJoined] = useState<RunId[]>(DEFAULT_JOINED)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  // Read join state from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RUNNER_JOINED_KEY)
      if (stored) setJoined(JSON.parse(stored))
    } catch { /* ignore */ }
  }, [])

  const toggleExpanded = (id: string) =>
    setExpanded((prev: Record<string, boolean>) => ({ ...prev, [id]: !prev[id] }))

  // Build the week's run list, sorted by day order
  const { today, pastToday, dates } = DEMO_WEEK
  const todaySeries = Object.values(SERIES).find(s => s.day === today && joined.includes(s.id)) ?? null

  // Upcoming rows (after today, this week)
  const dayOrder = DAY_ORDER
  const upcomingDays = dayOrder.filter(d => dayOrder.indexOf(d) > dayOrder.indexOf(today))
  const pastDays = dayOrder.filter(d => d !== today && pastToday.includes(d))

  const upcomingRuns = upcomingDays
    .map(day => Object.values(SERIES).find(s => s.day === day && joined.includes(s.id)))
    .filter((s): s is RunSeries => !!s)

  // Next week: repeat Mon–Tue for MMER + TigerWolves
  const nextWeekRuns: RunSeries[] = [
    joined.includes('mmer') ? { ...SERIES.mmer, dayName: 'MONDAY · NEXT WEEK' } : null,
    joined.includes('tigerwolves') ? { ...SERIES.tigerwolves, dayName: 'TUESDAY · NEXT WEEK' } : null,
  ].filter((s): s is RunSeries => !!s)

  const pastRuns = pastDays
    .map(day => Object.values(SERIES).find(s => s.day === day && joined.includes(s.id)))
    .filter((s): s is RunSeries => !!s)

  // Strip dots — which days have a run
  const stripDays = dayOrder.map(d => ({
    day: d,
    date: dates[d],
    isToday: d === today,
    isPast: pastToday.includes(d),
    hasRun: joined.some((id: RunId) => SERIES[id]?.day === d),
  }))

  return (
    <div className="flex flex-col gap-0 pt-10">
      {/* Header */}
      <div className="px-4 pb-3 flex justify-between items-start">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-tight">My Week</h1>
          <p className="text-[13px] text-gray-400 mt-0.5">{DEMO_WEEK.range} · {joined.length} runs</p>
        </div>
        {/* Account avatar (decorative) */}
        <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-sm font-bold">
          C
        </div>
      </div>

      {/* Week strip */}
      <div className="px-4 pb-4 flex gap-1.5">
        {stripDays.map(({ day, date, isToday, isPast, hasRun }) => (
          <StripCell key={day} day={day} date={date} isToday={isToday} isPast={isPast} hasRun={hasRun} />
        ))}
      </div>

      {/* Run list */}
      <div className="px-4 flex flex-col gap-3.5">

        {/* Today's card */}
        {todaySeries && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold tracking-widest uppercase text-orange-500">
                TODAY · {todaySeries.dayName}
              </span>
              <span className="flex-1 h-px bg-gray-100" />
            </div>
            <TodayCard
              series={todaySeries}
              expanded={!!expanded[todaySeries.id]}
              onToggle={() => toggleExpanded(todaySeries.id)}
            />
          </div>
        )}

        {/* Upcoming runs this week */}
        {upcomingRuns.map((series, i) => (
          <RunRow
            key={series.id}
            series={series}
            isNext={i === 0}
            isPast={false}
            expanded={!!expanded[series.id]}
            onToggle={() => toggleExpanded(series.id)}
          />
        ))}

        {/* Next week runs */}
        {nextWeekRuns.map(series => (
          <RunRow
            key={`next-${series.id}`}
            series={series}
            isNext={false}
            isPast={false}
            expanded={!!expanded[`next-${series.id}`]}
            onToggle={() => toggleExpanded(`next-${series.id}`)}
          />
        ))}

        {/* Past runs (MMER, TigerWolves today = done) */}
        {pastRuns.map(series => (
          <RunRow
            key={`past-${series.id}`}
            series={series}
            isNext={false}
            isPast={true}
            expanded={!!expanded[`past-${series.id}`]}
            onToggle={() => toggleExpanded(`past-${series.id}`)}
          />
        ))}

      </div>
    </div>
  )
}
