'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import FeedbackDrawer from './FeedbackDrawer'
import type { NBRRun } from '@/lib/allRunsData'
import type { PlatformInfo } from '@/lib/allRuns'
import { toggleRunFollow } from '@/app/actions'
import { formatDateShort } from '@/lib/dateUtils'

type Day = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
type TimeFilter = 'all' | 'am' | 'pm' | 'wknd'
type Category = 'All' | 'Beginner-Friendly' | 'Easy Runs' | 'Long Runs' | 'Food Runs' | 'Workouts'

const JS_DAY_TO_KEY: Day[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

const DAY_NAMES: Record<Day, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday',
  thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
}

const CATEGORIES: Category[] = ['All', 'Beginner-Friendly', 'Easy Runs', 'Long Runs', 'Food Runs', 'Workouts']

const TIME_FILTER_LABELS: Record<TimeFilter, string> = { all: 'All week', am: 'Morning', pm: 'Evening', wknd: 'Weekend' }

const CATEGORY_PILL: Record<string, string> = {
  'Beginner-Friendly': 'bg-green-100 text-green-800',
  'Easy Runs':         'bg-sky-100 text-sky-800',
  'Long Runs':         'bg-purple-100 text-purple-800',
  'Food Runs':         'bg-amber-100 text-amber-800',
  'Workouts':          'bg-blue-100 text-blue-800',
}

function offsetDate(base: Date, days: number): Date {
  const d = new Date(base)
  d.setDate(base.getDate() + days)
  return d
}

function nextOccurrence(base: Date, targetJsDay: number): Date {
  const diff = (targetJsDay - base.getDay() + 7) % 7
  return offsetDate(base, diff)
}

type Props = {
  runs: NBRRun[]
  // ISO date string from the server (e.g. "2026-09-05") — used as the stable
  // "today" anchor for both SSR and hydration to prevent React mismatch warnings.
  serverDate: string
  // #330: auth-aware personalization. Logged out → today's marketing directory
  // (no Following tier, no join affordances). Logged in → platform maps NBR id →
  // { runId, following } for entries that exist on the platform (joinable).
  isLoggedIn?: boolean
  platform?: Record<string, PlatformInfo>
}

export default function AllRunsClient({ runs, serverDate, isLoggedIn = false, platform = {} }: Props) {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  const [catFilter, setCatFilter] = useState<Category>('All')
  const [feedbackOpen, setFeedbackOpen] = useState(false)

  // Follow state seeded from the server, then updated optimistically on toggle.
  const [followed, setFollowed] = useState<Record<string, boolean>>(() => {
    const seed: Record<string, boolean> = {}
    for (const info of Object.values(platform)) seed[info.runId] = info.following
    return seed
  })
  const [pendingRunId, setPendingRunId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function toggleFollow(runId: string) {
    setPendingRunId(runId)
    startTransition(async () => {
      const res = await toggleRunFollow(runId)
      if (!res.error) {
        setFollowed(prev => ({ ...prev, [runId]: res.following ?? !prev[runId] }))
      }
      setPendingRunId(null)
    })
  }

  // Interpret serverDate as midnight local time — intentional, see page.tsx comment.
  const today = new Date(`${serverDate}T00:00:00`)

  // Runs the user currently follows (platform runs only), for the Following tier.
  const followingRuns = isLoggedIn
    ? runs.filter(r => { const p = platform[r.id]; return p && followed[p.runId] })
    : []

  function orderedDays(): { day: Day; date: Date; isLead: boolean; label: string }[] {
    if (timeFilter === 'wknd') {
      return (['sat', 'sun'] as Day[]).map(day => ({
        day,
        date: nextOccurrence(today, day === 'sat' ? 6 : 0),
        isLead: true,
      })).map(entry => {
        const diff = Math.round((entry.date.getTime() - today.getTime()) / 86400000)
        return {
          ...entry,
          label: diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : DAY_NAMES[entry.day],
        }
      }).sort((a, b) => a.date.getTime() - b.date.getTime())
    }

    const todayJsDay = today.getDay()
    return Array.from({ length: 7 }, (_, i) => {
      const day = JS_DAY_TO_KEY[(todayJsDay + i) % 7]
      return {
        day,
        date: offsetDate(today, i),
        isLead: i < 2,
        label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : DAY_NAMES[day],
      }
    })
  }

  function matchesFilter(run: NBRRun): boolean {
    if (timeFilter === 'am'   && run.startHour >= 12) return false
    if (timeFilter === 'pm'   && run.startHour < 12)  return false
    if (timeFilter === 'wknd' && run.day !== 'sat' && run.day !== 'sun') return false
    if (catFilter !== 'All'   && run.category !== catFilter) return false
    return true
  }

  // Right-side affordance on a run row (logged-in only): a Join/Joined toggle for
  // platform runs, a muted "Not on the app yet" for directory-only runs.
  function runAffordance(run: NBRRun) {
    if (!isLoggedIn) return null
    const p = platform[run.id]
    if (!p) {
      return (
        <span
          data-testid={`not-on-app-${run.id}`}
          className="flex-shrink-0 text-[11px] font-semibold text-[#a7adb8] whitespace-nowrap"
        >
          Not on the app yet
        </span>
      )
    }
    const isFollowing = !!followed[p.runId]
    return (
      <button
        data-testid={`follow-toggle-${p.runId}`}
        aria-label={isFollowing ? `Leave ${run.name}` : `Join ${run.name}`}
        onClick={() => toggleFollow(p.runId)}
        disabled={pendingRunId === p.runId}
        className={`flex-shrink-0 text-[12.5px] font-bold rounded-full px-3.5 py-1.5 touch-manipulation disabled:opacity-50 whitespace-nowrap flex items-center gap-1 ${
          isFollowing
            ? 'bg-green-100 text-green-800'
            : 'bg-orange-500 text-white shadow-sm'
        }`}
      >
        {isFollowing ? <><Check size={12} strokeWidth={3} /> Joined</> : '+ Join'}
      </button>
    )
  }

  const days = orderedDays()

  return (
    <div className="pb-4">
      {/* Following tier (signed-in, when the user follows at least one platform run) */}
      {isLoggedIn && followingRuns.length > 0 && (
        <div className="px-4 pb-3 flex flex-col gap-2" data-testid="following-tier">
          <div className="text-[11px] font-bold tracking-widest uppercase text-gray-400">Following</div>
          {followingRuns.map(run => {
            const p = platform[run.id]!
            return (
              <div
                key={run.id}
                data-testid={`following-run-${p.runId}`}
                className="bg-white border border-green-200 rounded-2xl px-4 py-3 flex gap-3 items-center"
              >
                <Link href={`/runs/${p.runId}`} className="flex-1 min-w-0 touch-manipulation">
                  <div className="text-[15px] font-bold text-gray-900 truncate">{run.name}</div>
                  <div className="text-[12.5px] text-gray-400">{DAY_NAMES[run.day]}s · {run.startTime}</div>
                </Link>
                <button
                  data-testid={`following-toggle-${p.runId}`}
                  aria-label={`Leave ${run.name}`}
                  onClick={() => toggleFollow(p.runId)}
                  disabled={pendingRunId === p.runId}
                  className="flex-shrink-0 text-[12.5px] font-bold rounded-full px-3.5 py-1.5 bg-green-100 text-green-800 touch-manipulation disabled:opacity-50 flex items-center gap-1"
                >
                  <Check size={12} strokeWidth={3} /> Joined
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Standfirst */}
      <p className="px-4 pb-2.5 text-[13px] leading-[1.45] text-[#8b93a1]">
        Over 20 weekly runs, every pace welcome. All paces, all distances.
      </p>

      {/* Time-of-day toggle */}
      <div className="flex gap-[7px] px-4 pb-2.5" data-testid="time-filter-row">
        {(['all', 'am', 'pm', 'wknd'] as const).map(t => {
          const active = timeFilter === t
          return (
            <button
              key={t}
              data-testid={`time-filter-${t}`}
              onClick={() => setTimeFilter(t)}
              className={`flex-1 py-2 rounded-full text-[12.5px] font-bold border touch-manipulation transition-colors whitespace-nowrap ${
                active
                  ? 'bg-[#ffedd5] text-[#c2410c] border-[#fdba74]'
                  : 'bg-white text-[#8b93a1] border-[#e8eaef]'
              }`}
            >
              {TIME_FILTER_LABELS[t]}
            </button>
          )
        })}
      </div>

      {/* Category chips */}
      <div className="flex gap-[7px] px-4 pb-3 overflow-x-auto [scrollbar-width:none] [-webkit-overflow-scrolling:touch]" data-testid="category-chip-row">
        {CATEGORIES.map(cat => {
          const active = catFilter === cat
          return (
            <button
              key={cat}
              data-testid={`category-chip-${cat.toLowerCase().replace(/[\s-]/g, '-')}`}
              onClick={() => setCatFilter(cat)}
              className={`flex-shrink-0 px-[13px] py-[7px] rounded-full text-[12.5px] font-bold border touch-manipulation transition-colors whitespace-nowrap ${
                active
                  ? 'bg-[#111827] text-white border-[#111827]'
                  : 'bg-white text-[#4b5568] border-[#e8eaef]'
              }`}
            >
              {cat}
            </button>
          )
        })}
      </div>

      {/* Day blocks */}
      <div className="flex flex-col gap-[18px] px-4 pt-0.5">
        {days.map(({ day, date, isLead, label }) => {
          const dayRuns = runs
            .filter(r => r.day === day && matchesFilter(r))
            .sort((a, b) => a.startHour - b.startHour)

          if (!isLead && dayRuns.length === 0) return null

          return (
            <div key={day} className="flex flex-col gap-[9px]" data-testid={`day-block-${day}`}>
              {/* Day header */}
              <div className="flex items-baseline gap-2">
                <span
                  className={`font-extrabold tracking-[.06em] uppercase ${
                    isLead ? 'text-[13px] text-[#f97316]' : 'text-[11px] text-[#8b93a1]'
                  }`}
                >
                  {label}
                </span>
                <span className="text-[12.5px] font-semibold text-[#a7adb8]">{formatDateShort(date)}</span>
                <span className="flex-1 h-px bg-[#e8eaef]" />
              </div>

              {/* Run rows or lead-day empty state */}
              {dayRuns.length === 0 ? (
                <div
                  className="border-[1.5px] border-dashed border-[#d7dbe3] rounded-2xl px-4 py-4 text-[13.5px] text-[#a7adb8] text-center"
                  data-testid="empty-day-state"
                >
                  Nothing matching this filter
                </div>
              ) : (
                dayRuns.map(run => (
                  <div
                    key={run.id}
                    data-testid="run-row"
                    className={`rounded-2xl px-[14px] py-3 flex gap-3 items-center bg-white shadow-[0_1px_3px_rgba(17,24,39,0.04)] ${
                      isLead ? 'border border-[#fdba74]' : 'border border-[#f1f2f5]'
                    }`}
                  >
                    <span
                      className={`w-[62px] flex-shrink-0 text-[13.5px] font-extrabold tracking-tight ${
                        run.startHour < 12 ? 'text-[#f97316]' : 'text-[#6366f1]'
                      }`}
                    >
                      {run.startTime}
                    </span>
                    <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
                      <span
                        className={`font-bold tracking-tight leading-snug ${
                          isLead ? 'text-[17px]' : 'text-[15px]'
                        }`}
                        data-testid="run-name"
                      >
                        {run.name}
                      </span>
                      <span className="text-[12.5px] text-[#8b93a1]">
                        {run.location} · {run.distance}
                      </span>
                      <span
                        className={`self-start text-[11px] font-bold rounded-full px-2 py-[3px] mt-px ${CATEGORY_PILL[run.category]}`}
                        data-testid="run-category-pill"
                      >
                        {run.category}
                      </span>
                    </div>
                    {runAffordance(run)}
                  </div>
                ))
              )}
            </div>
          )
        })}

        {/* Leader CTA */}
        <div
          className="border-[1.5px] border-dashed border-[#d7dbe3] rounded-[18px] px-4 py-[18px] flex flex-col gap-[9px] items-center text-center"
          data-testid="leader-cta"
        >
          <p className="text-[15px] font-bold text-[#111827]">Lead a run that isn&apos;t here?</p>
          <p className="text-[13px] leading-[1.45] text-[#8b93a1] max-w-[270px]">
            Tell us about your run and we&apos;ll get it added.
          </p>
          <button
            onClick={() => setFeedbackOpen(true)}
            className="text-[13.5px] font-bold text-white bg-[#111827] border-none rounded-xl px-[18px] py-[11px] touch-manipulation mt-1"
            data-testid="add-your-run-btn"
          >
            Add your run
          </button>
        </div>
      </div>

      <FeedbackDrawer
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        defaultType="run-leader"
      />
    </div>
  )
}
