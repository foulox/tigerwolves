'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import type { WorkoutVariantRow, CardTemplate } from '@/lib/data'
import { ABBREVIATIONS, RACE_TYPES } from '@/lib/data'
import WorkoutCardBody from '@/components/WorkoutCardBody'
import DeleteWorkoutButton from '@/components/DeleteWorkoutButton'
import ReactionPicker from '@/components/ReactionPicker'
import WorkoutFlagSheet, { FlagBadge } from '@/components/WorkoutFlagSheet'
import AdoptRouteControls from '@/components/AdoptRouteControls'
import { workoutVoteId } from '@/lib/votes'
import type { VoteData } from '@/lib/votes'
import { resolveAllowedTypes } from '@/lib/runProfile'
import { sortVariants, SORT_LABELS, DEFAULT_DIR, sortCountLabel, directionApplies, type SortField, type SortDir } from '@/lib/variantSort'
import { CARD_LINK, TYPE_LABEL, CARD_NAME, filterChip, SEARCH_FIELD, SEARCH_INPUT, SQUARE_LABEL } from '@/lib/cardStyles'
import SortControl from '@/components/SortControl'
import FiltersButton from '@/components/FiltersButton'
import FilterSheet from '@/components/FilterSheet'
import {
  applyLibraryFilters, activeFilterCount, activeFilterSummary, withCategory, withScope,
  type LibraryFilters,
} from '@/lib/libraryFilters'
import DistanceSlider from '@/components/DistanceSlider'
import { distanceBounds, applyDistanceRange, distanceRangeSummary, activeRange, type DistRange } from '@/lib/distanceFilter'

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const CATEGORIES = ['Quality', 'Long', 'Easy']

type StandaloneRow = { kind: 'standalone'; workout: WorkoutVariantRow }
type FamilyRow = {
  kind: 'family'
  familyId: number
  name: string; type: string; reason: string
  base: WorkoutVariantRow | null
  variants: WorkoutVariantRow[]
  total: number
  lastRan: string | null
}
type DisplayRow = StandaloneRow | FamilyRow

// Reads workout_variants/workout_families (#277) — replaces the legacy
// `workouts`-typed version. Family grouping mirrors ScheduleClient's own
// familyId-based grouping (#276) rather than the old name-string grouping.
// #401 (Story A): `variants` is the full shared catalog. "Your run" mode scopes it
// to the run's library; "All runs" browses the whole catalog. The category/type/race
// filters apply within whichever scope is active — the category selector is available
// in both modes now (a run's library can span categories). See visibleVariants below.
// #404: "Your run" scope is now the run's LIBRARY MEMBERSHIP (routes it created OR
// adopted — libraryFamilyIds), superseding #401's run_group_id ownership check.
// ledRuns/runGroupNames drive the adopt affordances (AC5/AC6) and the "adopted from
// <creator>" label; run_group_id is kept only as creator credit.
type LedRun = { id: string; name: string; kind: string; workoutTypes: string[] }
export default function LibraryClient({ variants, isLeader, isAdmin = false, voteData = {}, runId, allowedTypes, runGroupId, libraryFamilyIds = [], ledRuns = [], runGroupNames = {}, cardTemplate = null }: { variants: WorkoutVariantRow[]; isLeader: boolean; isAdmin?: boolean; voteData?: Record<string, VoteData | null>; runId?: string; allowedTypes?: string[]; runGroupId?: number | null; libraryFamilyIds?: number[]; ledRuns?: LedRun[]; runGroupNames?: Record<number, string>; cardTemplate?: CardTemplate | null }) {
  const [category, setCategory] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [raceFilter, setRaceFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [expandedFamily, setExpandedFamily] = useState<number | null>(null)
  const [expandedNotes, setExpandedNotes] = useState<number | null>(null)
  const [showAbbrev, setShowAbbrev] = useState(false)
  const [flagSheetFor, setFlagSheetFor] = useState<number | null>(null)
  const [showAllRuns, setShowAllRuns] = useState(false)
  // #461-followup: default to A–Z, not 'recent'. The last-ran sort EXCLUDES never-ran rows
  // (variantSort), so defaulting to it hid most of the catalog whenever last-ran was sparse.
  // A–Z shows every workout up front; the leader can switch to Last ran deliberately.
  const [sortField, setSortField] = useState<SortField>('az')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [distRange, setDistRange] = useState<DistRange>(null)
  const isDistanceCategory = category === 'Long' || category === 'Easy'

  const flaggedWorkout = flagSheetFor ? variants.find(w => w.id === flagSheetFor) ?? null : null

  // #404: "Your run" scopes the shared catalog to the run's LIBRARY MEMBERSHIP —
  // the family ids it created OR adopted (libraryFamilyIds); "All runs" browses
  // everything. A run not yet reconciled to a group (runGroupId null → empty
  // membership) falls back to the full catalog so the screen is never empty
  // (anonymous/non-leader views also hit this fallback, runGroupId null).
  const libSet = useMemo(() => new Set(libraryFamilyIds), [libraryFamilyIds])
  const inYourRun = !!runId && !showAllRuns
  const visibleVariants = useMemo(
    () => inYourRun && runGroupId != null ? variants.filter(w => libSet.has(w.familyId)) : variants,
    [inYourRun, runGroupId, variants, libSet]
  )

  // Only leaders who actually lead a reconciled run (non-null group → real membership)
  // see adopt/remove affordances (AC5/AC8). An unreconciled run falls back to the full
  // catalog with no membership, so adoption there would be meaningless.
  const canAdopt = isLeader && ledRuns.length > 0 && !!runId && runGroupId != null
  function adoptControls(familyId: number, creatorRunGroupId: number | null, workoutCategory: string, workoutType: string) {
    if (!canAdopt) return null
    return (
      <AdoptRouteControls
        familyId={familyId}
        creatorRunGroupId={creatorRunGroupId}
        myRunGroupId={runGroupId ?? null}
        runGroupNames={runGroupNames}
        inLibrary={libSet.has(familyId)}
        showAllRuns={showAllRuns}
        ledRuns={ledRuns}
        primaryRunId={runId!}
        workoutCategory={workoutCategory}
        workoutType={workoutType}
      />
    )
  }

  // The category selector is available in both modes now, so filtering is driven
  // by the category state directly (no per-run pinning).
  const effectiveCategory = category

  // Model C: the facet state assembled into one object the shared helpers operate on.
  const filters: LibraryFilters = { category, type: typeFilter, race: raceFilter, showAllRuns }

  const filteredBase = useMemo(
    () => applyLibraryFilters(visibleVariants, filters, search),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleVariants, category, typeFilter, raceFilter, showAllRuns, search],
  )
  // bounds come from the category-filtered candidates (before the distance filter)
  const distBounds = useMemo(() => distanceBounds(filteredBase), [filteredBase])

  // A stored range is only meaningful while it still fits inside the current bounds. When
  // the category switches (Long↔Easy have different spans) or a text search narrows the
  // pool, distBounds recomputes but distRange doesn't — treat a stale range as inactive
  // (show all) to prevent a silently empty list and off-track slider thumbs.
  const effectiveRange = isDistanceCategory ? activeRange(distRange, distBounds) : null

  const distSummary = effectiveRange ? distanceRangeSummary(effectiveRange) : ''
  const filterSummary = [activeFilterSummary(filters), distSummary].filter(Boolean).join(' · ')
  const filterCount = activeFilterCount(filters) + (effectiveRange ? 1 : 0)

  // #322: in "Your run" mode the type-filter options are the run's allowlist
  // (∩ types present); "All runs" mode shows every present type as before. An
  // empty allowlist falls back (inside resolveAllowedTypes) to present types.
  const presentTypes = visibleVariants.filter(w => !effectiveCategory || w.category === effectiveCategory).map(w => w.type)
  const types = inYourRun
    ? resolveAllowedTypes(presentTypes, allowedTypes ?? [])
    : Array.from(new Set(presentTypes)).sort()
  // All ordering (recent/az/rating/distance) is owned by sortVariants (#536); the first-seen
  // family grouping below preserves whatever order sortVariants returns.
  // effectiveRange is null outside the distance context (non-Long/Easy category), so
  // applyDistanceRange is a no-op there — no isDistanceCategory ternary needed.
  const distanceFiltered = applyDistanceRange(filteredBase, effectiveRange)
  const neverRanHidden = sortField === 'recent' ? distanceFiltered.filter(w => w.lastRan == null).length : 0
  const filtered = sortVariants(distanceFiltered, sortField, sortDir, voteData)

  // A family is "multi-version" (expandable Standard/Variation N group) only
  // when its familyId has more than one variant row — same rule ScheduleClient
  // uses (#276), so a lone variant with a non-null label still displays
  // standalone rather than as a one-item "family".
  const familyIds = useMemo(() => {
    const counts = new Map<number, number>()
    for (const w of visibleVariants) counts.set(w.familyId, (counts.get(w.familyId) ?? 0) + 1)
    const ids: number[] = []
    for (const [id, count] of counts) if (count > 1) ids.push(id)
    return new Set(ids)
  }, [visibleVariants])

  const displayRows: DisplayRow[] = []
  const seenFamilies = new Set<number>()
  for (const w of filtered) {
    if (!familyIds.has(w.familyId)) {
      displayRows.push({ kind: 'standalone', workout: w })
    } else if (!seenFamilies.has(w.familyId)) {
      seenFamilies.add(w.familyId)
      const allMembers = variants.filter(p => p.familyId === w.familyId)
      const base = allMembers.find(p => p.label === null) ?? null
      const members = allMembers
        .filter(p => p.label !== null)
        .sort((a, b) => (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity))
      const total = (base ? 1 : 0) + members.length
      const lastRan = allMembers.reduce<string | null>((best, p) => {
        if (!p.lastRan) return best
        if (!best) return p.lastRan
        return p.lastRan > best ? p.lastRan : best
      }, null)
      displayRows.push({ kind: 'family', familyId: w.familyId, name: w.name, type: w.type, reason: base?.reason ?? w.reason, base, variants: members, total, lastRan })
    }
  }

  function resetDistanceAxis() {
    setDistRange(null)
    if (sortField === 'distance') { setSortField('recent'); setSortDir(DEFAULT_DIR.recent) }
  }

  function setcat(c: string | null) {
    const next = withCategory(filters, c)
    setCategory(next.category); setTypeFilter(next.type)
    if (c !== 'Long' && c !== 'Easy') {
      resetDistanceAxis()
    }
  }

  function setScope(all: boolean) {
    const next = withScope(filters, all)
    setShowAllRuns(next.showAllRuns)
    setCategory(next.category)
    setTypeFilter(next.type)
    resetDistanceAxis()
  }

  return (
    <div className="pb-4">
      <div className="px-4 mb-4 flex justify-between items-start">
        <p className="text-sm text-muted">
          {filtered.length} workouts · {sortCountLabel(sortField, sortDir)}{neverRanHidden > 0 ? ` · ${neverRanHidden} never-ran hidden` : ''}
        </p>
        <div className="flex items-center gap-2" data-tour="library-manage">
          <button
            onClick={() => setShowAbbrev(v => !v)}
            className="w-8 h-8 flex items-center justify-center border border-line text-muted text-xs font-bold touch-manipulation"
            title="Abbreviation key"
            aria-label="Abbreviation key"
          >
            ?
          </button>
          {isLeader && (
            <Link href="/library/add" aria-label="Add workout" className="w-9 h-9 flex items-center justify-center bg-ink text-white text-xl font-bold touch-manipulation">
              +
            </Link>
          )}
        </div>
      </div>

      {showAbbrev && (
        <div className="mx-4 mb-4 p-3 bg-surface border border-line">
          <p className="text-xs font-bold text-ink mb-2">Abbreviation Key</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {ABBREVIATIONS.map(({ abbr, meaning }) => (
              <div key={abbr} className="flex gap-1.5 text-xs">
                <span className="font-bold text-ink shrink-0">{abbr}</span>
                <span className="text-muted">{meaning}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Model C top bar: search + sort */}
      <div className="px-4 mb-2 flex items-center gap-2">
        <div className={`${SEARCH_FIELD} flex-1`}>
          <span className="text-muted text-sm" aria-hidden="true">⌕</span>
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, type, race distance…"
            className={SEARCH_INPUT}
          />
        </div>
        <SortControl
          value={sortField}
          direction={sortDir}
          showDirection={directionApplies(sortField)}
          options={[
            { value: 'recent' as const, label: SORT_LABELS.recent },
            { value: 'az' as const, label: SORT_LABELS.az },
            { value: 'rating' as const, label: SORT_LABELS.rating },
            ...(isDistanceCategory ? [{ value: 'distance' as const, label: SORT_LABELS.distance }] : []),
          ]}
          onChange={(f) => { setSortField(f); setSortDir(DEFAULT_DIR[f]) }}
          onDirectionChange={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
        />
      </div>

      {/* Filters button carrying the active summary */}
      <div className="px-4 mb-3">
        <FiltersButton count={filterCount} summary={filterSummary} onOpen={() => setSheetOpen(true)} />
      </div>

      {/* The filter facets live in the sheet */}
      <FilterSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onClear={() => { setCategory(null); setTypeFilter(null); setRaceFilter(null); setShowAllRuns(false); resetDistanceAxis() }}
      >
        {runId && (
          <div>
            <p className="font-display uppercase tracking-[0.18em] text-[9px] font-semibold text-muted mb-2">Scope</p>
            <div className="flex gap-2">
              <button onClick={() => setScope(false)} className={filterChip(!showAllRuns)}>Your run</button>
              <button onClick={() => setScope(true)} className={filterChip(showAllRuns)}>All runs</button>
            </div>
          </div>
        )}

        <div>
          <p className="font-display uppercase tracking-[0.18em] text-[9px] font-semibold text-muted mb-2">Category</p>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setcat(null)} className={filterChip(!category)}>All</button>
            {CATEGORIES.map(c => (
              <button key={c} onClick={() => setcat(category === c ? null : c)} className={filterChip(category === c)}>{c}</button>
            ))}
          </div>
        </div>

        {isDistanceCategory && distBounds && (
          <div>
            <p className="font-display uppercase tracking-[0.18em] text-[9px] font-semibold text-muted mb-2">Distance</p>
            <DistanceSlider bounds={distBounds} value={effectiveRange ?? distBounds} onChange={setDistRange} />
          </div>
        )}

        {effectiveCategory && types.length > 1 && (
          <div>
            <p className="font-display uppercase tracking-[0.18em] text-[9px] font-semibold text-muted mb-2">Type</p>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => setTypeFilter(null)} className={filterChip(!typeFilter)}>All types</button>
              {types.map(t => (
                <button key={t} onClick={() => setTypeFilter(typeFilter === t ? null : t)} className={filterChip(typeFilter === t)}>{t}</button>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="font-display uppercase tracking-[0.18em] text-[9px] font-semibold text-muted mb-2">Race type</p>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setRaceFilter(null)} className={filterChip(!raceFilter)}>Any race</button>
            {RACE_TYPES.map(r => (
              <button key={r} onClick={() => setRaceFilter(raceFilter === r ? null : r)} className={filterChip(raceFilter === r)}>{r}</button>
            ))}
          </div>
        </div>

      </FilterSheet>

      <div className="px-4 flex flex-col gap-3">
        {visibleVariants.length === 0 && (
          <p className="text-muted italic text-sm">No workouts in the library yet.</p>
        )}
        {visibleVariants.length > 0 && displayRows.length === 0 && (
          <p className="text-muted italic text-sm">No workouts match your search.</p>
        )}
        {displayRows.map(row => {
          if (row.kind === 'standalone') {
            const w = row.workout
            return (
              <div key={`s-${w.id}`} data-testid="workout-card" className="bg-card p-4 border border-line">
                <div className="flex justify-between items-start gap-2">
                  <div className={CARD_NAME}>{w.name}</div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {w.flagged && (
                      <FlagBadge onClick={() => setFlagSheetFor(w.id)} />
                    )}
                    {isAdmin && <DeleteWorkoutButton variantId={w.id} />}
                    {isLeader && (
                      <Link
                        href={`/library/edit?variantId=${w.id}`}
                        className="w-7 h-7 flex items-center justify-center border border-line text-muted text-xs touch-manipulation"
                        aria-label="Edit workout"
                        title="Edit workout"
                      >✎</Link>
                    )}
                    {w.distanceMiles != null && <span className={TYPE_LABEL}>{w.distanceMiles.toFixed(1)} mi</span>}
                    <span className={TYPE_LABEL}>{w.type}</span>
                  </div>
                </div>
                {w.label && <p className="text-xs text-muted mt-0.5">{w.label}</p>}
                <WorkoutCardBody workout={w} layout={cardTemplate} expanded={expandedNotes === w.id} onToggle={() => setExpandedNotes(expandedNotes === w.id ? null : w.id)} />
                <div className="flex justify-end mt-2">
                  <ReactionPicker
                    workoutId={workoutVoteId(w.name, w.label ?? '')}
                    workoutName={w.name}
                    initialVoteData={voteData[workoutVoteId(w.name, w.label ?? '')] ?? null}
                  />
                </div>
                {isLeader && (
                  <div className="mt-3 pt-3 border-t border-line">
                    <Link
                      href={`/library/add?parent=${w.familyId}`}
                      className={CARD_LINK}
                    >
                      + Add variation
                    </Link>
                  </div>
                )}
                {adoptControls(w.familyId, w.runGroupId, w.category, w.type)}
              </div>
            )
          }

          const isExpanded = expandedFamily === row.familyId
          const headRow = row.base ?? row.variants[0]
          const familyCreatorGroupId = headRow?.runGroupId ?? null
          const familyFlagged = row.base?.flagged || row.variants.some(p => p.flagged)
          return (
            <div key={`f-${row.familyId}`} data-tour="library-variations">
              <button
                data-testid="workout-card"
                onClick={() => setExpandedFamily(isExpanded ? null : row.familyId)}
                className="w-full text-left bg-card p-4 border border-line touch-manipulation"
              >
                <div className="flex justify-between items-start gap-2">
                  <div className={CARD_NAME}>{row.name}</div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {familyFlagged && (
                      <FlagBadge
                        onClick={(e) => {
                          e.stopPropagation()
                          const flaggedMember = row.base?.flagged ? row.base : row.variants.find(p => p.flagged)
                          if (flaggedMember) setFlagSheetFor(flaggedMember.id)
                        }}
                      />
                    )}
                    <span className={SQUARE_LABEL}>
                      {row.total} versions
                    </span>
                    {headRow?.distanceMiles != null && <span className={TYPE_LABEL}>{headRow.distanceMiles.toFixed(1)} mi</span>}
                    <span className={TYPE_LABEL}>{row.type}</span>
                  </div>
                </div>
                <p className="text-sm text-muted mt-1.5 leading-snug">{row.reason}</p>
                <div className="text-xs text-muted mt-2">
                  {row.lastRan ? `Last ran ${formatDate(row.lastRan)}` : 'Never run'} · tap to {isExpanded ? 'collapse' : 'expand'}
                </div>
              </button>
              {adoptControls(row.familyId, familyCreatorGroupId, headRow?.category ?? '', row.type)}

              {isExpanded && (
                <div className="mt-1 ml-2 flex flex-col gap-1">
                  {row.base && (
                    <div className="bg-card px-4 py-3 border border-line">
                      <div className="flex justify-between items-start">
                        <div className="text-xs font-bold text-muted mb-0.5">Standard</div>
                        <div className="flex items-center gap-1.5">
                          {row.base.flagged && (
                            <FlagBadge onClick={() => setFlagSheetFor(row.base!.id)} />
                          )}
                          {isAdmin && <DeleteWorkoutButton variantId={row.base.id} />}
                          {isLeader && (
                            <Link
                              href={`/library/edit?variantId=${row.base.id}`}
                              className="w-7 h-7 flex items-center justify-center border border-line text-muted text-xs touch-manipulation"
                              aria-label="Edit"
                              title="Edit"
                            >✎</Link>
                          )}
                        </div>
                      </div>
                      <WorkoutCardBody workout={row.base} layout={cardTemplate} expanded={expandedNotes === row.base.id} onToggle={() => setExpandedNotes(expandedNotes === row.base!.id ? null : row.base!.id)} />
                      <div className="flex justify-end mt-2">
                        <ReactionPicker
                          workoutId={workoutVoteId(row.base.name, row.base.label ?? '')}
                          workoutName={row.base.name}
                          initialVoteData={voteData[workoutVoteId(row.base.name, row.base.label ?? '')] ?? null}
                        />
                      </div>
                    </div>
                  )}
                  {row.variants.map(p => (
                    <div key={p.id} className="bg-card px-4 py-3 border border-line">
                      <div className="flex justify-between items-start">
                        <div className="text-xs font-bold text-muted mb-0.5">Variation {p.sortOrder} of {row.total}</div>
                        <div className="flex items-center gap-1.5">
                          {p.flagged && (
                            <FlagBadge onClick={() => setFlagSheetFor(p.id)} />
                          )}
                          {isAdmin && <DeleteWorkoutButton variantId={p.id} />}
                          {isLeader && (
                            <Link
                              href={`/library/edit?variantId=${p.id}`}
                              className="w-7 h-7 flex items-center justify-center border border-line text-muted text-xs touch-manipulation"
                              aria-label="Edit"
                              title="Edit"
                            >✎</Link>
                          )}
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-ink font-display">{p.label}</div>
                      <WorkoutCardBody workout={p} layout={cardTemplate} expanded={expandedNotes === p.id} onToggle={() => setExpandedNotes(expandedNotes === p.id ? null : p.id)} />
                      <div className="flex justify-end mt-2">
                        <ReactionPicker
                          workoutId={workoutVoteId(p.name, p.label ?? '')}
                          workoutName={p.name}
                          initialVoteData={voteData[workoutVoteId(p.name, p.label ?? '')] ?? null}
                        />
                      </div>
                    </div>
                  ))}
                  {isLeader && (
                    <Link
                      href={`/library/add?parent=${row.familyId}`}
                      className={`bg-card px-4 py-3 border border-dashed border-line text-center block ${CARD_LINK}`}
                    >
                      + Add variation
                    </Link>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {flaggedWorkout && (
        <WorkoutFlagSheet workout={flaggedWorkout} isLeader={isLeader} onClose={() => setFlagSheetFor(null)} />
      )}
    </div>
  )
}
