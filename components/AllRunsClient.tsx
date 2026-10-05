'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import * as Sentry from '@sentry/nextjs'
import FeedbackDrawer from './FeedbackDrawer'
import RunEditorDrawer from './RunEditorDrawer'
import type { DirectoryRun } from '@/lib/db'
import type { DirectoryCard, ViewerContext } from '@/lib/allRuns'
import { directoryRunToCard, cardAffordance, adminCardControls } from '@/lib/allRuns'
import type { RunStatus } from '@/lib/allRuns'
import { toggleRunFollow } from '@/app/actions'
import { setUpRun, removeDirectoryRun } from '@/app/admin/actions'
import { KIND_TO_NBR_CATEGORY } from '@/lib/runProfile'
import type { NBRCategory } from '@/lib/runProfile'
import { formatDateShort } from '@/lib/dateUtils'

type EditorInitial = {
  runId: string
  name: string
  day: string
  time: string
  location: string
  distance: string
  category: NBRCategory
}

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

const CATEGORY_PILL_CLASS = 'bg-surface text-muted border border-line'

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
  const router = useRouter()
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  const [catFilter, setCatFilter] = useState<Category>('All')
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [editor, setEditor] = useState<{ mode: 'add' | 'edit'; initial?: EditorInitial } | null>(null)

  // Per-card set-up UI state: maps runId → { error, pending }
  const [setUpState, setSetUpState] = useState<Record<string, { error: string | null; pending: boolean }>>({})

  // Follow state seeded from the server, then updated optimistically on toggle.
  const [followedSet, setFollowedSet] = useState<Set<string>>(
    () => new Set(initialFollowedIds)
  )
  const [pendingRunId, setPendingRunId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  // Lookup map: raw DirectoryRun by id (needed to seed the edit drawer from raw fields)
  const runsById = new Map(runs.map(r => [r.id, r]))

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

  function handleRemove(runId: string, runName: string) {
    if (!confirm(`Remove "${runName}"? This cannot be undone.`)) return
    startTransition(async () => {
      try {
        const res = await removeDirectoryRun(runId)
        if (res.error) {
          alert(res.error)
        } else {
          router.refresh()
        }
      } catch (err) {
        Sentry.captureException(err)
        alert('Failed to remove run')
      }
    })
  }

  function handleSetUp(runId: string) {
    setSetUpState(prev => ({ ...prev, [runId]: { pending: true, error: null } }))
    startTransition(async () => {
      try {
        const res = await setUpRun(runId)
        if (res.error) {
          setSetUpState(prev => ({ ...prev, [runId]: { pending: false, error: res.error ?? null } }))
        } else {
          setSetUpState(prev => ({ ...prev, [runId]: { pending: false, error: null } }))
          router.refresh()
        }
      } catch (err) {
        Sentry.captureException(err)
        setSetUpState(prev => ({ ...prev, [runId]: { pending: false, error: 'Failed to set up run' } }))
      }
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
          className="mx-4 mb-4 border border-line bg-card rounded-[18px] px-4 py-[18px] flex flex-col gap-[11px] items-center text-center shadow-sm"
        >
          <Link
            href="/runs/tuesday-morning-tigerwolves"
            data-testid="intro-schedule-link"
            className="inline-flex items-center text-[14px] font-bold text-white bg-accent rounded-xl px-[18px] py-[11px] shadow-sm touch-manipulation"
          >
            See the TigerWolves schedule →
          </Link>
          {viewer.isLoggedIn ? (
            <>
              <p className="text-[13px] leading-[1.45] text-muted max-w-[270px]">
                Tap <strong className="text-accent">Join</strong> on any run below and it lands in <strong className="text-accent">My Plan</strong>.
              </p>
              <p
                data-testid="intro-nudge"
                className="text-[12.5px] leading-[1.45] text-muted max-w-[270px]"
              >
                Don&apos;t see your run? Ask its leader to add it to the app.
              </p>
            </>
          ) : (
            <>
              <p className="text-[13px] leading-[1.45] text-muted max-w-[270px]">
                Sign up to follow your favorite NBR runs and build your plan — all your runs in one place.
              </p>
              <Link
                href="/sign-in"
                data-testid="intro-signup-link"
                className="text-[13.5px] font-bold text-accent touch-manipulation"
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
          <div className="text-[11px] font-bold tracking-widest uppercase text-muted">Following</div>
          {followingCards.map(card => (
            <div
              key={card.id}
              data-testid={`following-run-${card.id}`}
              className="bg-card border border-green-200 rounded-2xl px-4 py-3 flex gap-3 items-center"
            >
              <Link href={`/runs/${card.id}`} className="flex-1 min-w-0 touch-manipulation">
                <div className="text-[15px] font-bold text-ink truncate">{card.name}</div>
                <div className="text-[12.5px] text-muted">{DAY_NAMES[card.day]}s · {card.startTime}</div>
              </Link>
              <button
                data-testid={`following-toggle-${card.id}`}
                aria-label={`Leave ${card.name}`}
                onClick={() => toggleFollow(card.id)}
                disabled={pendingRunId === card.id}
                className="flex-shrink-0 text-[12.5px] font-bold rounded-full px-3.5 py-1.5 bg-surface text-muted border border-line touch-manipulation disabled:opacity-50 flex items-center gap-1"
              >
                <Check size={12} strokeWidth={3} /> Joined
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Admin: + Add run button */}
      {viewer.isAdmin && (
        <div className="px-4 pb-2.5 flex justify-end">
          <button
            data-testid="admin-add-run"
            onClick={() => setEditor({ mode: 'add' })}
            className="text-[13px] font-bold text-white bg-accent rounded-xl px-4 py-2 touch-manipulation"
          >
            + Add run
          </button>
        </div>
      )}

      {/* Standfirst */}
      <p className="px-4 pb-2.5 text-[13px] leading-[1.45] text-muted">
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
                  ? 'bg-accent text-white border-accent'
                  : 'bg-card text-muted border-line'
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
                  ? 'bg-accent text-white border-accent'
                  : 'bg-card text-muted border-line'
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
                    isLead ? 'text-[13px] text-accent' : 'text-[11px] text-muted'
                  }`}
                >
                  {label}
                </span>
                <span className="text-[12.5px] font-semibold text-muted">{formatDateShort(date)}</span>
                <span className="flex-1 h-px bg-line" />
              </div>

              {/* Run rows or lead-day empty state */}
              {dayCards.length === 0 ? (
                <div
                  className="border-[1.5px] border-dashed border-line rounded-2xl px-4 py-4 text-[13.5px] text-muted text-center"
                  data-testid="empty-day-state"
                >
                  Nothing matching this filter
                </div>
              ) : (
                dayCards.map(card => {
                  const a = cardAffordance(card, viewerCtx)
                  const admin = adminCardControls(card, viewerCtx)
                  const isFollowing = followedSet.has(card.id)
                  const setUp = setUpState[card.id] ?? { error: null, pending: false }

                  const cardBody = (
                    <>
                      <span
                        className="w-[62px] flex-shrink-0 text-[13.5px] font-extrabold tracking-tight text-ink"
                      >
                        {card.startTime}
                      </span>
                      <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`font-bold tracking-tight leading-snug ${
                              isLead ? 'text-[17px]' : 'text-[15px]'
                            }`}
                            data-testid="run-name"
                          >
                            {card.name}
                          </span>
                          {/* Admin status badge */}
                          {viewer.isAdmin && (
                            <span
                              data-testid={`admin-status-${card.id}`}
                              className={`text-[9.5px] font-extrabold tracking-wide uppercase rounded-full px-2 py-[2px] border ${
                                card.status === 'live'
                                  ? 'bg-green-100 text-green-800 border-green-200'
                                  : card.status === 'draft'
                                  ? 'bg-amber-100 text-amber-800 border-amber-200'
                                  : 'bg-gray-100 text-gray-500 border-gray-200'
                              }`}
                            >
                              {card.status === 'live' ? 'Live' : card.status === 'draft' ? 'Draft' : 'Unclaimed'}
                            </span>
                          )}
                        </div>
                        <span className="text-[12.5px] text-muted">
                          {card.location} · {card.distance}
                        </span>
                        <span
                          className={`self-start text-[11px] font-bold rounded-full px-2 py-[3px] mt-px ${CATEGORY_PILL_CLASS}`}
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
                          ? 'bg-surface text-muted border border-line'
                          : 'bg-accent text-white shadow-sm'
                      }`}
                    >
                      {isFollowing ? <><Check size={12} strokeWidth={3} /> Joined</> : '+ Join'}
                    </button>
                  ) : null

                  return (
                    <div
                      key={card.id}
                      data-testid="run-row"
                      className={`relative rounded-2xl px-[14px] py-3 flex flex-col gap-2 bg-card shadow-sm ${
                        isLead ? 'border border-accent' : 'border border-line'
                      }`}
                    >
                      {a.showDraftBadge && !viewer.isAdmin && (
                        <span className="absolute -top-2 left-3 text-[9.5px] font-extrabold tracking-wide uppercase rounded-full px-2 py-[2px] bg-amber-100 text-amber-800 border border-amber-200">
                          Draft
                        </span>
                      )}
                      {/* Main card row */}
                      <div className="flex gap-3 items-center">
                        {a.linkable ? (
                          <>
                            <Link
                              href={`/runs/${card.id}`}
                              className="flex-1 min-w-0 flex gap-3 items-center touch-manipulation"
                            >
                              {cardBody}
                              <span className="flex-shrink-0 text-[20px] font-bold text-muted ml-0.5">›</span>
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

                      {/* Admin controls row — only renders for admins */}
                      {viewer.isAdmin && (
                        <div className="flex flex-wrap gap-2 pt-1 border-t border-line">
                          {/* ✏️ Edit */}
                          {admin.canEdit && (
                            <button
                              data-testid={`admin-edit-${card.id}`}
                              aria-label={`Edit ${card.name}`}
                              onClick={() => {
                                const r = runsById.get(card.id)!
                                setEditor({
                                  mode: 'edit',
                                  initial: {
                                    runId: r.id,
                                    name: r.name,
                                    day: r.day_of_week ?? '',
                                    time: r.meeting_time ?? '',
                                    location: r.meeting_location ?? '',
                                    distance: r.distance ?? '',
                                    category: KIND_TO_NBR_CATEGORY[r.kind ?? ''] ?? 'Easy Runs',
                                  },
                                })
                              }}
                              className="text-[12px] font-bold text-muted bg-surface rounded-lg px-2.5 py-1 touch-manipulation hover:bg-line"
                            >
                              ✏️ Edit
                            </button>
                          )}

                          {/* ⚙️ Manage → */}
                          {admin.canManage && (
                            <Link
                              href={`/admin/runs/${card.id}`}
                              data-testid={`admin-manage-${card.id}`}
                              className="text-[12px] font-bold text-muted bg-surface rounded-lg px-2.5 py-1 touch-manipulation hover:bg-line"
                            >
                              ⚙️ Manage →
                            </Link>
                          )}

                          {/* 👤 Set up → */}
                          {admin.canSetUp && (
                            <>
                              <button
                                data-testid={`admin-setup-${card.id}`}
                                onClick={() => handleSetUp(card.id)}
                                disabled={setUp.pending}
                                className="text-[12px] font-bold text-blue-700 bg-blue-50 rounded-lg px-2.5 py-1 touch-manipulation hover:bg-blue-100 disabled:opacity-40"
                              >
                                {setUp.pending ? 'Setting up…' : '👤 Set up →'}
                              </button>
                              {setUp.error && (
                                <p className="text-[12px] text-red-600 w-full">{setUp.error}</p>
                              )}
                            </>
                          )}

                          {/* 🗑 Remove */}
                          {admin.canRemove && (
                            <button
                              data-testid={`admin-remove-${card.id}`}
                              aria-label={`Remove ${card.name}`}
                              onClick={() => handleRemove(card.id, card.name)}
                              className="text-[12px] font-bold text-red-600 bg-red-50 rounded-lg px-2.5 py-1 touch-manipulation hover:bg-red-100"
                            >
                              🗑
                            </button>
                          )}
                        </div>
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
          className="border-[1.5px] border-dashed border-line rounded-[18px] px-4 py-[18px] flex flex-col gap-[9px] items-center text-center"
          data-testid="leader-cta"
        >
          <p className="text-[15px] font-bold text-ink">Lead a run that isn&apos;t here?</p>
          <p className="text-[13px] leading-[1.45] text-muted max-w-[270px]">
            Tell us about your run and we&apos;ll get it added.
          </p>
          <button
            onClick={() => setFeedbackOpen(true)}
            className="text-[13.5px] font-bold text-white bg-accent border-none rounded-xl px-[18px] py-[11px] touch-manipulation mt-1"
            data-testid="add-your-run-btn"
          >
            Add your run
          </button>
        </div>
      </div>

      <RunEditorDrawer
        open={!!editor}
        mode={editor?.mode ?? 'add'}
        initial={editor?.initial}
        onClose={() => setEditor(null)}
        onSaved={() => { setEditor(null); router.refresh() }}
      />

      <FeedbackDrawer
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        defaultType="run-leader"
      />
    </div>
  )
}
