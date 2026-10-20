'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Copy, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import type { ScheduleEntry, WorkoutVariantRow, RunConfig, RunLeader } from '@/lib/data'
import { resolveWorkoutVariant } from '@/lib/scheduleUtils'
import { resolveAllowedTypes, isWorkoutKind, kindToCategory } from '@/lib/runProfile'
import { buildPost, buildVerificationLabel, formatDateLong } from '@/lib/postBuilder'
import { filterChip, SQUARE_LABEL, NEXT_UP_LABEL, CARD_NAME, SEARCH_FIELD, SEARCH_INPUT } from '@/lib/cardStyles'
import { setPlanWorkout } from '@/app/actions'
import { captureClientEvent } from '@/lib/analyticsClient'
import { workoutVoteId, ratingToEmoji } from '@/lib/votes'
import type { VoteData } from '@/lib/votes'
import Header from '@/components/Header'
import WorkoutCardBody from '@/components/WorkoutCardBody'
import LeaderPicker from '@/components/LeaderPicker'
import AdoptRouteControls from '@/components/AdoptRouteControls'
import { formatDateShort } from '@/lib/dateUtils'
import { schedulePickerScope, schedulePickerSuggestions, allRunsCategories, allRunsTypes } from '@/lib/schedulePicker'
import { sortVariants, SORT_LABELS, DEFAULT_DIR, sortCountLabel, directionApplies, type SortField, type SortDir } from '@/lib/variantSort'
import SortControl from '@/components/SortControl'
import FiltersButton from '@/components/FiltersButton'
import FilterSheet from '@/components/FilterSheet'
import { scheduleFilterCount, scheduleFilterSummary, type ScheduleFilters } from '@/lib/scheduleFilters'


type PlanStandaloneRow = { kind: 'standalone'; workout: WorkoutVariantRow }
type PlanFamilyRow = { kind: 'family'; familyId: number; name: string; variants: WorkoutVariantRow[]; total: number }
type PlanDisplayRow = PlanStandaloneRow | PlanFamilyRow

// Grow a textarea to fit its whole content (no manual resize handle). Called on
// every content change and on mount, so a remount (e.g. after a tab switch)
// re-sizes even when the content hasn't changed since it was last hidden.
function growToFit(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

function VoteBadge({ v }: { v: { avg: number; count: number } | null | undefined }) {
  if (v && v.count > 0) {
    return <span className="text-base text-muted tabular-nums">{ratingToEmoji(v.avg)} {v.count}</span>
  }
  return <span className="text-base text-muted">🙂</span>
}

type LedRun = { id: string; name: string; kind: string; workoutTypes: string[] }

type Props = {
  upcoming: ScheduleEntry[]
  variants: WorkoutVariantRow[]
  initialWeekIndex?: number
  isLeader: boolean
  voteData?: Record<string, VoteData | null>
  runConfig: RunConfig
  roster: string[]
  runLeaders: RunLeader[]
  // #404: the run's library membership (family ids it created OR adopted). The picker
  // scopes to it; empty means fall back to the full catalog (unreconciled run).
  libraryFamilyIds?: number[]
  // #405: adopt affordances for the "All runs" borrow mode — the runs this leader
  // leads (adopt targets + the multi-run picker) and group-id→name for the "adopted
  // from <creator>" label, mirroring what LibraryClient receives.
  ledRuns?: LedRun[]
  runGroupNames?: Record<number, string>
}

export default function ScheduleClient({ upcoming, variants, initialWeekIndex = 0, isLeader, voteData = {}, runConfig, roster, runLeaders, libraryFamilyIds, ledRuns = [], runGroupNames = {} }: Props) {
  const [weekIndex, setWeekIndex] = useState(initialWeekIndex)
  const [selectedWorkouts, setSelectedWorkouts] = useState<WorkoutVariantRow[]>([])
  const [showCount, setShowCount] = useState(3)
  const [pickerSearch, setPickerSearch] = useState('')
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [activeType, setActiveType] = useState<string | null>(null)
  // #405: "All runs" borrow mode — widens the picker past the run's library to the
  // whole catalog, with its own category/type browse pills (independent of the week's
  // type chips, which the widened mode ignores).
  const [showAllRuns, setShowAllRuns] = useState(false)
  const [sortField, setSortField] = useState<SortField>('recent')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [browseCategory, setBrowseCategory] = useState<string | null>(null)
  const [browseType, setBrowseType] = useState<string | null>(null)
  const [browseTypeCleared, setBrowseTypeCleared] = useState(false)
  const [yourRunBrowseType, setYourRunBrowseType] = useState<string | null>(null)
  const [planTab, setPlanTab] = useState<'post' | 'browse'>('post')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [leaderPickerOpen, setLeaderPickerOpen] = useState(false)
  const [localLeader, setLocalLeader] = useState<string | null>(null)
  const [verified, setVerified] = useState(false)
  const [editedPost, setEditedPost] = useState<string | null>(null)
  const postRef = useRef<HTMLTextAreaElement>(null)
  // Callback ref: resizes on mount so a remount after a tab switch re-fits even
  // when `draftPost` is unchanged (a plain [draftPost] effect would skip it).
  const setPostRef = useCallback((el: HTMLTextAreaElement | null) => {
    postRef.current = el
    growToFit(el)
  }, [])

  useEffect(() => { setVerified(false) }, [weekIndex])

  const entry = upcoming[weekIndex]

  // #347: a Workout-kind run picks by workout TYPE (the Quality type chips); a
  // non-Workout run (Easy/Long/Food) has no typing, so it picks
  // from its whole category (kind→category) instead. Both still pick a workout and
  // it goes in the post — buildPost renders a light line (name + reason) for the
  // non-Workout case.
  const isWorkout = isWorkoutKind(runConfig.kind)
  const runCategory = kindToCategory(runConfig.kind)

  const scheduledTypes = entry ? entry.workoutType.split(' or ').map(t => t.trim()) : []
  const effectiveType = activeType ?? scheduledTypes[0] ?? ''

  // #322: the type chips offer the run's workout-type allowlist intersected with the
  // types present in its library. Workout runs only — a non-Workout run has no type
  // chips (it scopes by category instead), so leave this empty for them.
  const availableTypes = useMemo(() =>
    isWorkout
      ? resolveAllowedTypes(
          variants.filter(w => w.category === 'Quality').map(w => w.type),
          runConfig.workoutTypes,
        )
      : []
  , [variants, runConfig.workoutTypes, isWorkout])

  // A family is "multi-version" (Standard/Longer picker UI) when it has more
  // than one variant row — label alone isn't the signal, since a lone variant
  // can still carry a non-null label.
  const familyIds = useMemo(() => {
    const counts = new Map<number, number>()
    for (const w of variants) counts.set(w.familyId, (counts.get(w.familyId) ?? 0) + 1)
    const s = new Set<number>()
    for (const [id, count] of counts) if (count > 1) s.add(id)
    return s
  }, [variants])

  // Look up the already-scheduled workout across the FULL library, not the
  // type-filtered allSuggestions — a leader can deliberately schedule a workout
  // whose type doesn't match the week's nominal type (a real override, not bad
  // data), and that should still be recognized rather than silently swapped
  // for an unrelated suggestion.
  const plannedWorkout = useMemo(() => {
    if (!entry?.workoutName) return null
    return resolveWorkoutVariant(variants, entry.workoutName, entry.selectedVariations)
  }, [entry, variants])

  const plannedNotFound = !!entry?.workoutName && plannedWorkout === null

  // #404 (was #401): in the default "Your run" scope the picker is scoped to this
  // run's LIBRARY — the routes it created OR adopted (run_workouts membership),
  // superseding the run_group_id ownership check so adopted routes are schedulable
  // too (AC3). A run not yet reconciled to a group (runGroupId null → empty
  // membership) falls back to the full catalog so the picker is never empty, as #401.
  // #405: an "All runs" toggle widens the scope past the library to the whole catalog
  // for a one-time cross-run borrow (see scopeVariants + schedulePicker helpers).
  const libSet = useMemo(() => new Set(libraryFamilyIds ?? []), [libraryFamilyIds])
  const ownVariants = useMemo(() => {
    if (runConfig.runGroupId == null) return variants
    return variants.filter(w => libSet.has(w.familyId))
  }, [variants, runConfig.runGroupId, libSet])

  // #405: the base set both the suggestion list and the search box draw from —
  // "Your run" = the library, "All runs" = every run's workouts.
  const scopeVariants = useMemo(
    () => schedulePickerScope(showAllRuns, ownVariants, variants),
    [showAllRuns, ownVariants, variants],
  )

  // #405: adopt affordances only for a leader whose run is reconciled to a group
  // (real membership) and who actually leads at least one run — same gate as
  // LibraryClient's canAdopt. Shown per-card in "All runs" mode alongside the
  // one-time "Schedule for this week" (borrow) action.
  const canAdopt = isLeader && ledRuns.length > 0 && runConfig.runGroupId != null

  // #405: "All runs" browse pills — every category/type present across ALL runs
  // (not the run's allowlist or the week's nominal type). Empty in "Your run" mode.
  const browseCategories = useMemo(() => (showAllRuns ? allRunsCategories(variants) : []), [showAllRuns, variants])
  const browseTypes = useMemo(() => (showAllRuns ? allRunsTypes(variants, browseCategory) : []), [showAllRuns, variants, browseCategory])

  const allSuggestions = useMemo(() => {
    if (!entry) return []
    const weekTypes = showAllRuns
      ? []
      : browseTypeCleared
        ? []
        : yourRunBrowseType
          ? [yourRunBrowseType]
          : activeType ? [activeType] : entry.workoutType.split(' or ').map(t => t.trim())
    return schedulePickerSuggestions({
      showAllRuns,
      ownVariants,
      allVariants: variants,
      isWorkout,
      runCategory,
      weekTypes,
      browseCategory,
      browseType,
      plannedId: plannedWorkout?.id ?? null,
    })
  }, [entry, ownVariants, variants, showAllRuns, activeType, browseTypeCleared, yourRunBrowseType, plannedWorkout, isWorkout, runCategory, browseCategory, browseType])

  const pickerSource = useMemo(() => {
    const q = pickerSearch.toLowerCase()
    if (!q) return allSuggestions
    return scopeVariants
      // #405 (review): in "All runs" mode a search stacks ON TOP of the active
      // category/type browse pills (matching the Library), instead of widening
      // back out to the whole catalog. No-op in "Your run" mode.
      .filter(w => !showAllRuns || !browseCategory || w.category === browseCategory)
      .filter(w => !showAllRuns || !browseType || w.type === browseType)
      .filter(w =>
        w.name.toLowerCase().includes(q) ||
        w.type.toLowerCase().includes(q) ||
        (w.label ?? '').toLowerCase().includes(q) ||
        w.reason.toLowerCase().includes(q) ||
        w.raceTypes.some(r => r.toLowerCase().includes(q))
      )
      .filter(w => !plannedWorkout || workoutKey(w) !== workoutKey(plannedWorkout))
  }, [pickerSearch, allSuggestions, scopeVariants, plannedWorkout, showAllRuns, browseCategory, browseType])

  // #241: sort through the shared sort model — recent / A–Z / rating, with direction.
  const rankedSource = useMemo(
    () => sortVariants(pickerSource, sortField, sortDir, voteData),
    [pickerSource, sortField, sortDir, voteData],
  )

  const effectiveBrowseType = !showAllRuns && isWorkout && !browseTypeCleared
    ? (yourRunBrowseType ?? activeType ?? entry?.workoutType ?? null)
    : null
  const scheduleFilters: ScheduleFilters = {
    showAllRuns,
    typeLabel: effectiveBrowseType,
    browseCategory,
    browseType,
  }
  const filterCount = scheduleFilterCount(scheduleFilters)
  const filterSummary = scheduleFilterSummary(scheduleFilters)

  const displayRows = useMemo<PlanDisplayRow[]>(() => {
    const rows: PlanDisplayRow[] = []
    const seen = new Set<number>()
    for (const w of rankedSource) {
      if (!familyIds.has(w.familyId)) {
        rows.push({ kind: 'standalone', workout: w })
      } else if (!seen.has(w.familyId)) {
        seen.add(w.familyId)
        const members = rankedSource
          .filter(p => p.familyId === w.familyId)
          .sort((a, b) => (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity))
        rows.push({ kind: 'family', familyId: w.familyId, name: w.name, variants: members, total: members.length })
      }
    }
    return rows
  }, [rankedSource, familyIds])

  const visibleRows = pickerSearch ? displayRows : displayRows.slice(0, showCount)
  const remainingCount = pickerSearch ? 0 : displayRows.length - showCount

  const effectiveSelections: WorkoutVariantRow[] = selectedWorkouts.length > 0
    ? selectedWorkouts
    : plannedWorkout
      ? [plannedWorkout]
      : entry?.workoutName
        ? []
        : (() => {
            const w = allSuggestions[0] ?? null
            return w ? [w] : []
          })()

  function workoutKey(w: WorkoutVariantRow) {
    return String(w.id)
  }

  function isEffectivelySelected(w: WorkoutVariantRow): boolean {
    return effectiveSelections.some(s => workoutKey(s) === workoutKey(w))
  }

  function changeWeek(idx: number) {
    setWeekIndex(idx)
    setSelectedWorkouts([])
    setShowCount(3)
    setPickerSearch('')
    setCopied(false)
    setSaved(false)
    setExpandedId(null)
    setActiveType(null)
    setShowAllRuns(false)
    setBrowseCategory(null)
    setBrowseType(null)
    setBrowseTypeCleared(false)
    setYourRunBrowseType(null)
    // #241: sort is a browse filter too — reset on a week change so a "Top rated"
    // view doesn't silently carry into the next week's list.
    setSortField('recent'); setSortDir('asc')
    setPlanTab('post')
    setLeaderPickerOpen(false)
    setLocalLeader(null)
  }

  // #405: toggling scope resets the browse filters + search so a stale filter from one
  // scope can't silently empty the other (mirrors LibraryClient.setScope). Selection is
  // left intact — a workout picked in one scope stays picked.
  function setScope(all: boolean) {
    setShowAllRuns(all)
    setBrowseCategory(null)
    setBrowseType(null)
    setBrowseTypeCleared(false)
    setYourRunBrowseType(null)
    // #405 (review): reset the week-type chip too, like every other filter — else a
    // "Hills" selection made in "Your run" silently persists across a scope round-trip.
    setActiveType(null)
    // #241: reset sort on a scope round-trip too.
    setSortField('recent'); setSortDir('asc')
    setPickerSearch('')
    setShowCount(3)
  }

  function selectBrowseCategory(c: string | null) {
    setBrowseCategory(c)
    setBrowseType(null)
  }

  function toggleExpand(id: string) {
    setExpandedId(prev => prev === id ? null : id)
  }

  // #405: the "+ Add to my run" adopt affordance (reuses #404's control), shown per
  // card ONLY in "All runs" mode — distinct from the one-time "Schedule for this week"
  // borrow (the card select + save). Renders nothing for a route already in the library,
  // when the leader can't adopt, or (#412) when the route's type fits none of the runs
  // the leader leads (AdoptRouteControls short-circuits on all three).
  function adoptControls(familyId: number, creatorRunGroupId: number | null, workoutCategory: string, workoutType: string) {
    if (!showAllRuns || !canAdopt) return null
    return (
      <div className="px-4 pb-3">
        <AdoptRouteControls
          familyId={familyId}
          creatorRunGroupId={creatorRunGroupId}
          myRunGroupId={runConfig.runGroupId ?? null}
          runGroupNames={runGroupNames}
          inLibrary={libSet.has(familyId)}
          showAllRuns={showAllRuns}
          ledRuns={ledRuns}
          primaryRunId={runConfig.id}
          workoutCategory={workoutCategory}
          workoutType={workoutType}
        />
      </div>
    )
  }

  function handleSelect(w: WorkoutVariantRow) {
    setSelectedWorkouts(prev => {
      const key = workoutKey(w)
      if (prev.some(s => workoutKey(s) === key)) {
        return prev.filter(s => workoutKey(s) !== key)
      }
      if (prev.length === 2 && prev[0].familyId === w.familyId) {
        return [prev[0], w]
      }
      if (prev.length === 1 && prev[0].familyId === w.familyId) {
        return [prev[0], w]
      }
      return [w]
    })
    setSaved(false)
  }

  const effectiveLeader = localLeader ?? entry?.leader ?? ''
  const post = entry && effectiveSelections.length > 0 && runConfig
    ? buildPost({ ...entry, leader: effectiveLeader }, effectiveSelections, runConfig, roster, activeType)
    : ''

  // #383: the leader can tweak the generated post inline, this-week-only. The
  // edit is displayed and copied; it never touches the saved template.
  const draftPost = editedPost ?? post

  // Regenerate discards edits (AC4). `post` is a primitive string compared by
  // value, so a Change-workout peek that doesn't alter the selection leaves the
  // edit intact; any change to week / selection / type / leader recomputes
  // `post` and clears the edit.
  useEffect(() => { setEditedPost(null) }, [post])

  // Auto-grow the textarea to fit its whole content (no manual resize handle) —
  // preserves the old <pre>'s whole-post-visible feel. Documented deviation from
  // the mockup's fixed min-height in the design README. Mount-time sizing is
  // handled by setPostRef; this effect covers content changes while mounted.
  useEffect(() => { growToFit(postRef.current) }, [draftPost])

  // #241: a change to the committed week type re-derives the browse chip — a
  // previously-cleared chip must snap back to filtering by the new committed type.
  useEffect(() => { setBrowseTypeCleared(false); setYourRunBrowseType(null) }, [activeType])

  function handleCopy() {
    navigator.clipboard.writeText(draftPost).then(() => {
      setCopied(true)
      captureClientEvent('heylo_post_copied')
      setTimeout(() => setCopied(false), 2000)
    })
  }

  async function handleSetPlan() {
    if (!entry || effectiveSelections.length === 0) return
    const sorted = [...effectiveSelections].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    setSaving(true)
    try {
      await setPlanWorkout(entry.date, sorted[0].name, sorted.map(w => w.label ?? ''))
      setSaved(true)
      setVerified(false)
      setPlanTab('post')
    } catch (err) {
      Sentry.captureException(err, { extra: { date: entry.date, workoutName: sorted[0].name } })
    } finally {
      setSaving(false)
    }
  }

  if (upcoming.length === 0) {
    return (
      <>
        <Header title="Schedule" isLeader={isLeader} />
        <div className="px-4" data-tour="heylo-area">
          <p className="text-muted mt-4">No upcoming weeks on the schedule.</p>
        </div>
      </>
    )
  }

  return (
    <>
      <Header title="Schedule" isLeader={isLeader} />
      <div className="px-4 pb-4" data-tour="heylo-area">

        {/* Week nav */}
        <div className={`flex items-center justify-between bg-card border border-line px-2 py-2 ${leaderPickerOpen ? 'mb-2' : 'mb-5'}`}>
          <button
            onClick={() => changeWeek(weekIndex - 1)}
            disabled={weekIndex === 0}
            aria-label="Previous week"
            className="p-2 touch-manipulation disabled:opacity-30 text-muted active:bg-surface"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="text-center">
            {isLeader && entry && !leaderPickerOpen ? (
              <button
                onClick={() => setLeaderPickerOpen(true)}
                className="text-left touch-manipulation"
                aria-label="Change leader for this week"
              >
                <div className="text-sm font-semibold text-ink flex items-center gap-1">
                  {localLeader ?? entry.leader}
                  {entry.needsLeader && <span className="text-[9px] bg-red-50 text-red-600 font-bold px-1.5 py-0.5 rounded">Needs leader</span>}
                  <span className="text-xs text-link">tap to change</span>
                </div>
              </button>
            ) : (
              <div className="text-sm font-semibold text-ink">{entry ? (localLeader ?? entry.leader) : '—'}</div>
            )}
            <div className="text-xs text-muted">{entry ? formatDateShort(new Date(entry.date + 'T00:00:00')) : ''}</div>
          </div>
          <button
            onClick={() => changeWeek(weekIndex + 1)}
            disabled={weekIndex >= upcoming.length - 1}
            aria-label="Next week"
            className="p-2 touch-manipulation disabled:opacity-30 text-muted active:bg-surface"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {isLeader && leaderPickerOpen && entry && (
          <div className="mb-3 bg-card border border-line overflow-hidden">
            <LeaderPicker
              date={entry.date}
              currentLeader={localLeader ?? entry.leader}
              runLeaders={runLeaders}
              onClose={() => setLeaderPickerOpen(false)}
              onSaved={(name) => { setLocalLeader(name); setLeaderPickerOpen(false) }}
            />
          </div>
        )}

        {entry && (
          <>
            {isWorkout && (
            <div className="bg-surface border border-line p-4 mb-6">
              <div className={`${NEXT_UP_LABEL} mb-1`}>WORKOUT TYPE</div>
              <div className={`${CARD_NAME}`}>{activeType ?? entry.workoutType}</div>
              {activeType && (
                <div className="text-xs text-muted mt-0.5">Scheduled: {entry.workoutType}</div>
              )}
              <div className="text-xs text-muted mt-1">{formatDateLong(entry.date)}</div>
              {/* Only offer the type picker when there's a real choice — a lone
                  chip is just noise (mirrors the Library's types.length > 1 gate).
                  #405: hidden in "All runs" mode, which browses by its own category/
                  type pills below and ignores the week's type allowlist. */}
              {!showAllRuns && availableTypes.length > 1 && (
                <div className="flex gap-2 overflow-x-auto mt-3 pb-0.5 -mx-1 px-1">
                  {availableTypes.map(t => {
                    const isActive = activeType === null ? scheduledTypes.includes(t) : t === activeType
                    return (
                      <button key={t} type="button"
                        onClick={() => setActiveType(scheduledTypes.includes(t) ? null : t)}
                        className={filterChip(isActive)}
                      >
                        {t}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            )}

            {plannedNotFound && (
              <div className="bg-red-50 border border-red-200 p-3 mb-4 text-sm text-red-700">
                ⚠️ &ldquo;{entry.workoutName}&rdquo; is no longer in the workout library — pick a replacement below.
              </div>
            )}

            {plannedWorkout && (() => {
              const w = plannedWorkout
              const sel = isEffectivelySelected(w)
              const eid = `planned-${w.id}`
              const expanded = expandedId === eid
              return (
                <div className="mb-4">
                  <div className="text-sm font-bold text-ink mb-2">Currently planned</div>
                  <div
                    className={`bg-card border transition-colors ${sel ? 'border-2 border-ink' : 'border-line'}`}
                  >
                    <button
                      onClick={() => handleSelect(w)}
                      className="w-full text-left p-4 touch-manipulation cursor-pointer"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="font-semibold text-ink">{w.name}</div>
                        <div className="flex items-center gap-2 shrink-0">
                          <VoteBadge v={voteData[workoutVoteId(w.name, w.label ?? '')]} />
                        </div>
                      </div>
                      {w.label && <div className="text-xs text-muted mt-0.5">{w.label}</div>}
                    </button>
                    <div className="px-4 pb-4">
                      <WorkoutCardBody
                        workout={w}
                        layout={runConfig.cardTemplate}
                        expanded={expanded}
                        onToggle={() => toggleExpand(eid)}
                      />
                    </div>
                  </div>
                </div>
              )
            })()}

            {plannedWorkout && (
              <div className="flex border border-line mb-4">
                <button
                  onClick={() => setPlanTab('post')}
                  className={`flex-1 py-2.5 text-xs font-bold transition-colors touch-manipulation ${
                    planTab === 'post' ? 'bg-ink text-white' : 'text-muted'
                  }`}
                >
                  Post draft
                </button>
                <button
                  onClick={() => setPlanTab('browse')}
                  className={`flex-1 py-2.5 text-xs font-bold transition-colors touch-manipulation ${
                    planTab === 'browse' ? 'bg-ink text-white' : 'text-muted'
                  }`}
                >
                  Change workout
                </button>
              </div>
            )}

            {(!plannedWorkout || planTab === 'browse') && (
              <>
                {/* Model C top bar: search + sort */}
                <div className="flex items-center gap-2 mb-2">
                  <div className={`${SEARCH_FIELD} flex-1`}>
                    <span className="text-muted text-sm" aria-hidden="true">⌕</span>
                    <input
                      type="search"
                      value={pickerSearch}
                      onChange={e => setPickerSearch(e.target.value)}
                      placeholder={showAllRuns ? "Search every run's workouts…" : "Search your run's workouts…"}
                      className={SEARCH_INPUT}
                    />
                  </div>
                  <SortControl
                    value={sortField}
                    direction={sortDir}
                    showDirection={directionApplies(sortField)}
                    options={[
                      { value: 'recent', label: SORT_LABELS.recent },
                      { value: 'az', label: SORT_LABELS.az },
                      { value: 'rating', label: SORT_LABELS.rating },
                    ]}
                    onChange={(f) => { setSortField(f); setSortDir(DEFAULT_DIR[f]) }}
                    onDirectionChange={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                  />
                </div>

                <div className="mb-3">
                  <FiltersButton count={filterCount} summary={filterSummary} onOpen={() => setSheetOpen(true)} />
                </div>

                <FilterSheet
                  open={sheetOpen}
                  onClose={() => setSheetOpen(false)}
                  onClear={() => { setShowAllRuns(false); setBrowseCategory(null); setBrowseType(null); setBrowseTypeCleared(false); setYourRunBrowseType(null) }}
                >
                  {runConfig.runGroupId != null && (
                    <div>
                      <p className="font-display uppercase tracking-[0.18em] text-[9px] font-semibold text-muted mb-2">Scope</p>
                      <div className="flex gap-2">
                        <button onClick={() => setScope(false)} className={filterChip(!showAllRuns)}>Your run</button>
                        <button onClick={() => setScope(true)} className={filterChip(showAllRuns)}>All runs</button>
                      </div>
                    </div>
                  )}

                  {/* Your-run workout: Type facet — full browse-only picker (All types + per-type pills) */}
                  {!showAllRuns && isWorkout && availableTypes.length > 1 && (
                    <div>
                      <p className="font-display uppercase tracking-[0.18em] text-[9px] font-semibold text-muted mb-2">Type</p>
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => { setBrowseTypeCleared(true); setYourRunBrowseType(null) }}
                          className={filterChip(browseTypeCleared)}
                        >All types</button>
                        {availableTypes.map(t => {
                          const scheduled = activeType ? t === activeType : scheduledTypes.includes(t)
                          const active = !browseTypeCleared && (yourRunBrowseType === t || (yourRunBrowseType === null && scheduled))
                          return (
                            <button
                              key={t}
                              onClick={() => { setBrowseTypeCleared(false); setYourRunBrowseType(t) }}
                              className={filterChip(active)}
                            >{t}{scheduled ? ' (this week)' : ''}</button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* All-runs browse pills */}
                  {showAllRuns && browseCategories.length > 0 && (
                    <div>
                      <p className="font-display uppercase tracking-[0.18em] text-[9px] font-semibold text-muted mb-2">Category</p>
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => selectBrowseCategory(null)} className={filterChip(!browseCategory)}>All</button>
                        {browseCategories.map(c => (
                          <button key={c} onClick={() => selectBrowseCategory(browseCategory === c ? null : c)} className={filterChip(browseCategory === c)}>{c}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {showAllRuns && browseTypes.length > 1 && (
                    <div>
                      <p className="font-display uppercase tracking-[0.18em] text-[9px] font-semibold text-muted mb-2">Type</p>
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => setBrowseType(null)} className={filterChip(!browseType)}>All types</button>
                        {browseTypes.map(t => (
                          <button key={t} onClick={() => setBrowseType(browseType === t ? null : t)} className={filterChip(browseType === t)}>{t}</button>
                        ))}
                      </div>
                    </div>
                  )}

                  {showAllRuns && (
                    <p className="text-xs text-muted leading-snug">
                      Browsing every run&rsquo;s workouts. <span className="font-semibold text-ink">Schedule for this week</span> borrows one for this week only — it won&rsquo;t join your library or rotation. <span className="font-semibold text-link">+ Add to my run</span> adopts it permanently. You can only <span className="font-semibold text-link">+ Add</span> a route whose type fits one of your runs — borrow works for any type.
                    </p>
                  )}
                </FilterSheet>

                {allSuggestions.length === 0 && !pickerSearch ? (
                  <p className="text-muted italic text-sm">
                    {showAllRuns
                      ? 'No workouts match these filters.'
                      : isWorkout
                        ? (plannedWorkout
                            ? `No other ${entry.workoutType} workouts to switch to yet.`
                            : `No ${entry.workoutType} workouts in the library yet.`)
                        : (plannedWorkout
                            ? 'No other workouts to switch to yet.'
                            : 'No workouts in your library yet.')}
                  </p>
                ) : displayRows.length === 0 ? (
                  <p className="text-muted italic text-sm">{pickerSearch ? 'No workouts match your search.' : 'No workouts match these filters.'}</p>
                ) : (
                  <div className="mb-6">
                    <div className="text-sm font-bold text-ink mb-2">
                      {pickerSearch ? `All workouts matching "${pickerSearch}"` : `Workouts — ${sortCountLabel(sortField, sortDir)}`}
                    </div>
                    <div className="flex flex-col gap-2">
                      {visibleRows.map(row => {
                        if (row.kind === 'standalone') {
                          const w = row.workout
                          const sel = isEffectivelySelected(w)
                          const eid = `s-${w.id}`
                          const expanded = expandedId === eid
                          return (
                            <div
                              key={`s-${w.id}`}
                              className={`bg-card border transition-colors ${sel ? 'border-2 border-ink' : 'border-line'}`}
                            >
                              <button
                                onClick={() => handleSelect(w)}
                                className="w-full text-left p-4 touch-manipulation cursor-pointer"
                              >
                                <div className="flex justify-between items-start gap-2">
                                  <div className="font-semibold text-ink">{w.name}</div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <VoteBadge v={voteData[workoutVoteId(w.name, w.label ?? '')]} />
                                  </div>
                                </div>
                                {w.label && <div className="text-xs text-muted mt-0.5">{w.label}</div>}
                              </button>
                              <div className="px-4 pb-4">
                                <WorkoutCardBody
                                  workout={w}
                                  layout={runConfig.cardTemplate}
                                  expanded={expanded}
                                  onToggle={() => toggleExpand(eid)}
                                />
                              </div>
                              {adoptControls(w.familyId, w.runGroupId, w.category, w.type)}
                            </div>
                          )
                        }

                        // Family row — all versions always visible, up to 2 selectable.
                        // Badge text is a generic ordinal ("Standard" / "Variation N of
                        // Total"), not driven by label — label is a short leader-authored
                        // tag ("Shorter"/"Longer"), shown as the subtitle beneath it.
                        return (
                          <div key={`f-${row.familyId}`} className="bg-card border border-line overflow-hidden">
                            <div className="px-4 py-3 border-b border-line">
                              <div className="flex justify-between items-start gap-2">
                                <div className="font-semibold text-ink">{row.name}</div>
                                <span className={`${SQUARE_LABEL} shrink-0`}>
                                  {row.total} versions
                                </span>
                              </div>
                            </div>
                            {row.variants.map((v, i) => {
                              const sel = isEffectivelySelected(v)
                              const isLast = i === row.variants.length - 1
                              const eid = `f-variant-${v.id}`
                              const expanded = expandedId === eid
                              const label = i === 0 ? 'Standard' : `Variation ${i + 1} of ${row.total}`
                              return (
                                <div key={v.id} className={`${!isLast ? 'border-b border-line' : ''} ${sel ? 'bg-surface' : 'bg-card'}`}>
                                  <button
                                    onClick={() => handleSelect(v)}
                                    className="w-full text-left px-4 pt-3 pb-1 touch-manipulation"
                                  >
                                    <div className="flex justify-between items-start gap-2">
                                      <div className="flex items-center gap-2">
                                        <div className={`w-4 h-4 border-2 flex-shrink-0 ${sel ? 'border-ink bg-ink' : 'border-line'}`} />
                                        <span className={`text-xs font-bold ${i === 0 ? 'text-muted' : 'text-ink'}`}>{label}</span>
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        <VoteBadge v={voteData[workoutVoteId(v.name, v.label ?? '')]} />
                                      </div>
                                    </div>
                                    {v.label && <div className="text-sm text-ink mt-1 ml-6 leading-snug">{v.label}</div>}
                                  </button>
                                  <div className="px-4 pb-3 ml-6">
                                    <WorkoutCardBody
                                      workout={v}
                                      layout={runConfig.cardTemplate}
                                      expanded={expanded}
                                      onToggle={() => toggleExpand(eid)}
                                    />
                                  </div>
                                </div>
                              )
                            })}
                            {adoptControls(row.familyId, row.variants[0]?.runGroupId ?? null, row.variants[0]?.category ?? '', row.variants[0]?.type ?? '')}
                          </div>
                        )
                      })}
                    </div>
                    {remainingCount > 0 && (
                      <button
                        onClick={() => setShowCount(showCount + 3)}
                        className="mt-3 w-full py-2.5 border border-line text-sm font-medium text-muted bg-card active:bg-surface touch-manipulation"
                      >
                        Show {Math.min(remainingCount, 3)} more
                      </button>
                    )}
                  </div>
                )}

                {effectiveSelections.length > 0 && (
                  <button
                    onClick={handleSetPlan}
                    disabled={saving || saved}
                    className={`w-full flex items-center justify-center gap-2 py-3.5 font-semibold text-sm mb-6 touch-manipulation transition-colors ${
                      saved
                        ? 'bg-green-500 text-white'
                        : 'bg-ink text-white active:bg-ink disabled:opacity-60'
                    }`}
                  >
                    {saved ? <><Check size={16} /> Saved to plan</> : saving ? 'Saving…' : showAllRuns ? 'Schedule for this week' : 'Set as plan'}
                  </button>
                )}
              </>
            )}

            {(!plannedWorkout || planTab === 'post') && effectiveSelections.length > 0 && (
              <div className="flex flex-col gap-3 p-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[10px] font-bold text-muted tracking-wide uppercase">
                      This week&rsquo;s post · {formatDateShort(new Date(entry.date + 'T00:00:00'))}
                    </div>
                    <div className="text-xs text-link flex items-center gap-1">✎ editable</div>
                  </div>
                  <textarea
                    ref={setPostRef}
                    value={draftPost}
                    onChange={e => setEditedPost(e.target.value)}
                    aria-label="Editable weekly post"
                    spellCheck={false}
                    className="w-full min-h-[210px] resize-none border border-line bg-card px-3 py-3 text-sm text-ink leading-relaxed font-sans touch-manipulation focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink"
                  />
                  <div className="text-xs text-muted mt-1.5 px-0.5">
                    Changes here affect only this week&rsquo;s post — your template stays as saved.
                  </div>
                </div>
                <div className="flex items-start gap-3 bg-surface px-4 py-3">
                  <input
                    type="checkbox"
                    id="verify-checkbox"
                    checked={verified}
                    onChange={e => setVerified(e.target.checked)}
                    className="mt-0.5 w-4 h-4 shrink-0 accent-ink touch-manipulation"
                  />
                  <label htmlFor="verify-checkbox" className="text-sm text-muted leading-snug cursor-pointer">
                    {effectiveSelections.length > 0 ? buildVerificationLabel(effectiveSelections[0]) : 'I\'ve verified the key workout details'}
                  </label>
                </div>
                <button
                  onClick={handleCopy}
                  disabled={!verified}
                  data-tour="heylo-copy"
                  className={`flex items-center justify-center gap-2 w-full py-3.5 font-bold text-sm touch-manipulation transition-opacity ${verified ? 'bg-ink text-white' : 'bg-ink text-white opacity-35 cursor-not-allowed'}`}
                >
                  {copied ? <><Check size={16} /> Copied!</> : <><Copy size={16} /> Copy to clipboard</>}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
