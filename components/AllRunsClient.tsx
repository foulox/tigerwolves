'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import FeedbackDrawer from './FeedbackDrawer'
import type { DirectoryRun } from '@/lib/db'
import type { DirectoryCard, ViewerContext } from '@/lib/allRuns'
import { directoryRunToCard, cardAffordance } from '@/lib/allRuns'
import type { RunStatus } from '@/lib/allRuns'
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
  runs: DirectoryRun[]
  viewer: { isLoggedIn: boolean; isAdmin: boolean; owningLeaderRunId: string | null }
  initialFollowedIds: string[]
  // ISO date string from the server (e.g. "2026-09-05") — used as the stable
  // "today" anchor for both SSR and hydration to prevent React mismatch warnings.
  serverDate: string
  // #357: show the intro box for anonymous users and signed-in users with no follows.
  showIntro?: boolean
}

export default function AllRunsClient({ runs, viewer, initialFollowedIds, serverDate, showIntro = false }: Props) {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  const [catFilter, setCatFilter] = useState<Category>('All')
  const [feedbackOpen, setFeedbackOpen] = useState(false)

  // Follow state seeded from the server, then updated optimistically on toggle.
  const [followedSet, setFollowedSet] = useState<Set<string>>(
    () => new Set(initialFollowedIds)
  )
  const [pendingRunId, setPendingRunId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function toggleFollow(runId: string) {
    setPendingRunId(runId)
    startTransition(async () => {
      const res = await toggleRunFollow(runId)
      if (!res.error) {
        setFollowedSet(prev => {
          const next = new Set(prev)
          if (res.following ?? !prev.has(runId)) {
            next.add(runId)
          } else {
            next.delete(runId)
          }
          return next
        })
      }
      setPendingRunId(null)
    })
  }

  // Interpret serverDate as midnight local time — intentional, see page.tsx comment.
  const today = new Date(`${serverDate}T00:00:00`)

  // Build cards once from DB runs; cast status since DirectoryRun.status is string.
  const cards: DirectoryCard[] = runs.map(r =>
    directoryRunToCard({ ...r, status: r.status as RunStatus })
  )

  // Build the viewer context each render, incorporating current follow state.
  const viewerCtx: ViewerContext = {
    ...viewer,
    followedRunIds: [...followedSet],
  }

  // Runs the user currently follows, for the Following tier.
  const followingCards = viewer.isLoggedIn
    ? cards.filter(card => followedSet.has(card.id))
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

  function matchesFilter(card: DirectoryCard): boolean {
    if (timeFilter === 'am'   && card.startHour >= 12) return false
    if (timeFilter === 'pm'   && card.startHour < 12)  return false
    if (timeFilter === 'wknd' && card.day !== 'sat' && card.day !== 'sun') return false
    if (catFilter !== 'All'   && card.category !== catFilter) return false
    return true
  }

  const days = orderedDays()

  return (
    <div className="pb-4">
      {/* Intro box (#357): shown for anonymous users and signed-in users with no follows */}
      {showIntro && (
        <div
          data-testid="all-runs-intro"
          className="mx-4 mb-4 border border-[#fdba74] bg-[#fff7ed] rounded-[18px] px-4 py-[18px] flex flex-col gap-[11px] items-center text-center shadow-[0_1px_3px_rgba(249,115,22,0.08)]"
        >
          <Link
            href="/runs/tuesday-morning-tigerwolves"
            data-testid="intro-schedule-link"
            className="inline-flex items-center text-[14px] font-bold text-white bg-orange-500 rounded-xl px-[18px] py-[11px] shadow-sm touch-manipulation"
          >
            See the TigerWolves schedule →
          </Link>
          {viewer.isLoggedIn ? (
            <>
              <p className="text-[13px] leading-[1.45] text-[#4b5568] max-w-[270px]">
                Tap <strong className="text-[#c2410c]">Join</strong> on any run below and it lands in <strong className="text-[#c2410c]">My Plan</strong>.
              </p>
              <p
                data-testid="intro-nudge"
                className="text-[12.5px] leading-[1.45] text-[#8b93a1] max-w-[270px]"
              >
                Don&apos;t see your run? Ask its leader to add it to the app.
              </p>
            </>
          ) : (
            <>
              <p className="text-[13px] leading-[1.45] text-[#4b5568] max-w-[270px]">
                Sign up to follow your favorite NBR runs and build your plan — all your runs in one place.
              </p>
              <Link
                href="/sign-in"
                data-testid="intro-signup-link"
                className="text-[13.5px] font-bold text-[#c2410c] touch-manipulation"
              >
                Sign up →
              </Link>
            </>
          )}
        </div>
      )}

      {/* Following tier (signed-in, when the user follows at least one run) */}
      {viewer.isLoggedIn && followingCards.length > 0 && (
        <div className="px-4 pb-3 flex flex-col gap-2" data-testid="following-tier">
          <div className="text-[11px] font-bold tracking-widest uppercase text-gray-400">Following</div>
          {followingCards.map(card => (
            <div
              key={card.id}
              data-testid={`following-run-${card.id}`}
              className="bg-white border border-green-200 rounded-2xl px-4 py-3 flex gap-3 items-center"
            >
              <Link href={`/runs/${card.id}`} className="flex-1 min-w-0 touch-manipulation">
                <div className="text-[15px] font-bold text-gray-900 truncate">{card.name}</div>
                <div className="text-[12.5px] text-gray-400">{DAY_NAMES[card.day]}s · {card.startTime}</div>
              </Link>
              <button
                data-testid={`following-toggle-${card.id}`}
                aria-label={`Leave ${card.name}`}
                onClick={() => toggleFollow(card.id)}
                disabled={pendingRunId === card.id}
                className="flex-shrink-0 text-[12.5px] font-bold rounded-full px-3.5 py-1.5 bg-green-100 text-green-800 touch-manipulation disabled:opacity-50 flex items-center gap-1"
              >
                <Check size={12} strokeWidth={3} /> Joined
              </button>
            </div>
          ))}
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
          const dayCards = cards
            .filter(card => {
              const a = cardAffordance(card, viewerCtx)
              return a.visible && card.day === day && matchesFilter(card)
            })
            .sort((a, b) => a.startHour - b.startHour)

          if (!isLead && dayCards.length === 0) return null

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
              {dayCards.length === 0 ? (
                <div
                  className="border-[1.5px] border-dashed border-[#d7dbe3] rounded-2xl px-4 py-4 text-[13.5px] text-[#a7adb8] text-center"
                  data-testid="empty-day-state"
                >
                  Nothing matching this filter
                </div>
              ) : (
                dayCards.map(card => {
                  const a = cardAffordance(card, viewerCtx)
                  const isFollowing = followedSet.has(card.id)

                  const cardBody = (
                    <>
                      <span
                        className={`w-[62px] flex-shrink-0 text-[13.5px] font-extrabold tracking-tight ${
                          card.startHour < 12 ? 'text-[#f97316]' : 'text-[#6366f1]'
                        }`}
                      >
                        {card.startTime}
                      </span>
                      <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
                        <span
                          className={`font-bold tracking-tight leading-snug ${
                            isLead ? 'text-[17px]' : 'text-[15px]'
                          }`}
                          data-testid="run-name"
                        >
                          {card.name}
                        </span>
                        <span className="text-[12.5px] text-[#8b93a1]">
                          {card.location} · {card.distance}
                        </span>
                        <span
                          className={`self-start text-[11px] font-bold rounded-full px-2 py-[3px] mt-px ${CATEGORY_PILL[card.category]}`}
                          data-testid="run-category-pill"
                        >
                          {card.category}
                        </span>
                      </div>
                    </>
                  )

                  const joinButton = a.joinable ? (
                    <button
                      data-testid={`follow-toggle-${card.id}`}
                      aria-label={isFollowing ? `Leave ${card.name}` : `Join ${card.name}`}
                      onClick={() => toggleFollow(card.id)}
                      disabled={pendingRunId === card.id}
                      className={`flex-shrink-0 text-[12.5px] font-bold rounded-full px-3.5 py-1.5 touch-manipulation disabled:opacity-50 whitespace-nowrap flex items-center gap-1 ${
                        isFollowing
                          ? 'bg-green-100 text-green-800'
                          : 'bg-orange-500 text-white shadow-sm'
                      }`}
                    >
                      {isFollowing ? <><Check size={12} strokeWidth={3} /> Joined</> : '+ Join'}
                    </button>
                  ) : null

                  return (
                    <div
                      key={card.id}
                      data-testid="run-row"
                      className={`relative rounded-2xl px-[14px] py-3 flex gap-3 items-center bg-white shadow-[0_1px_3px_rgba(17,24,39,0.04)] ${
                        isLead ? 'border border-[#fdba74]' : 'border border-[#f1f2f5]'
                      }`}
                    >
                      {a.showDraftBadge && (
                        <span className="absolute -top-2 left-3 text-[9.5px] font-extrabold tracking-wide uppercase rounded-full px-2 py-[2px] bg-amber-100 text-amber-800 border border-amber-200">
                          Draft
                        </span>
                      )}
                      {a.linkable ? (
                        <>
                          <Link
                            href={`/runs/${card.id}`}
                            className="flex-1 min-w-0 flex gap-3 items-center touch-manipulation"
                          >
                            {cardBody}
                            <span className="flex-shrink-0 text-[20px] font-bold text-[#c7ccd6] ml-0.5">›</span>
                          </Link>
                          {joinButton}
                        </>
                      ) : (
                        <>
                          <div className="flex-1 min-w-0 flex gap-3 items-center">
                            {cardBody}
                          </div>
                          {/* Non-linkable rows: no chevron, no Join button for non-joinable */}
                          {joinButton}
                        </>
                      )}
                    </div>
                  )
                })
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
