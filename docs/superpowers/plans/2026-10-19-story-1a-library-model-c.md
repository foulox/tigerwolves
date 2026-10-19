# Story 1A — Library picker → Model C Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the Library page's search/filter controls into the "Model C" surface — a slim top bar (search + sort), a Filters button that summarizes the active filters, and a bottom-sheet holding the filter facets — and extract the filter/reset logic into shared, unit-tested pure helpers.

**Architecture:** The filter state and the rules that derive from it (what's active, how to summarize it, how resets cascade, how the list is filtered) move out of `LibraryClient` into a pure `lib/libraryFilters.ts` module with full unit tests. Three presentational components (`SortControl`, `FiltersButton`, `FilterSheet`) render the Model C chrome; they carry no business logic and are verified on the Preview URL (vitest runs node-env, so there is no DOM test runner — this matches the #241 precedent). `LibraryClient` keeps its own `useState`, derives a `LibraryFilters` object from it, and wires the new components. Behaviour (which workouts show, the sort label, resets) is unchanged from today; only the surface changes. The three components are built generic so Story 1B can reuse them for the Schedule picker.

**Tech Stack:** Next.js App Router, React client components, Tailwind v4 (NBR tokens in `lib/cardStyles.ts`), vitest (node-env) for pure helpers, Playwright for e2e.

**Spec:** `docs/superpowers/specs/2026-10-18-axis-aware-picker-redesign-design.md`

## Global Constraints

- **No schema migration** in this story — UI/logic only.
- **No behaviour change** to which workouts appear, the sort options (still `recent` / `rating`), or the count line text (`N workouts · oldest first` / `N workouts · top rated`). This story is a surface reorganization.
- **NBR tokens only** — reuse `filterChip`, `SEARCH_FIELD`, `SEARCH_INPUT` from `lib/cardStyles.ts`; square corners, Jost display, ink/muted/line, cyan = links only. No new palette.
- **`touch-manipulation`** on every interactive element.
- **`aria-label`** on every icon-only / text-free control (the Filters button has text; the sort trigger needs an explicit label — see Task 2).
- **Distance axis and the A–Z / direction / never-ran sort changes are OUT of scope** — they are Stories 1B/2/4. The sort control here presents exactly the two existing options.
- **Tests:** vitest is node-env (no DOM). Pure helpers are unit-tested; component rendering is verified on the Preview URL and by updated Playwright specs.

## Review Focus

- **No active filters → the button reads `Filters`, not an empty summary, and shows no count badge.** (Pinned by Task 1 `activeFilterSummary`/`activeFilterCount` tests.)
- **Category change clears the type filter; scope toggle clears both category and type** — the existing reset rules must survive the refactor. (Pinned by Task 1 `withCategory`/`withScope` tests.)
- **Rating threshold still ANDs with the other facets** after extraction into `applyLibraryFilters`. (Pinned by Task 1 test.)
- **A long active summary must truncate on a ~320px phone, not wrap or push the layout.** (No DOM test — Task 2 sets `truncate`/`min-w-0`; verified on Preview in Task 5.)
- **Opening/closing the sheet must not drop in-progress search text or the selected sort.** (No DOM test — search and sort live in top-bar state independent of the sheet; verified on Preview in Task 5.)

---

### Task 1: Pure filter model — `lib/libraryFilters.ts`

**Files:**
- Create: `lib/libraryFilters.ts`
- Test: `__tests__/libraryFilters.test.ts`

**Interfaces:**
- Consumes: `WorkoutVariantRow` (`lib/data`), `VoteData` + `workoutVoteId` (`lib/votes`), `RatingThreshold` + `passesRatingThreshold` (`lib/rating`).
- Produces:
  - `type LibraryFilters = { category: string | null; type: string | null; race: string | null; rating: RatingThreshold; showAllRuns: boolean }`
  - `EMPTY_FILTERS: LibraryFilters`
  - `activeFilterCount(f: LibraryFilters): number`
  - `activeFilterSummary(f: LibraryFilters): string`
  - `matchesQuery(w: WorkoutVariantRow, query: string): boolean`
  - `applyLibraryFilters(variants: WorkoutVariantRow[], f: LibraryFilters, query: string, voteData: Record<string, VoteData | null>): WorkoutVariantRow[]`
  - `withCategory(f: LibraryFilters, category: string | null): LibraryFilters`
  - `withScope(f: LibraryFilters, showAllRuns: boolean): LibraryFilters`

- [ ] **Step 1: Write the failing test**

Create `__tests__/libraryFilters.test.ts`. The `makeVariant` fixture mirrors `__tests__/schedulePicker.test.ts` (only the read fields are set):

```ts
import { describe, test, expect } from 'vitest'
import {
  EMPTY_FILTERS,
  activeFilterCount,
  activeFilterSummary,
  matchesQuery,
  applyLibraryFilters,
  withCategory,
  withScope,
  type LibraryFilters,
} from '../lib/libraryFilters'
import type { WorkoutVariantRow } from '../lib/data'
import type { VoteData } from '../lib/votes'
import { workoutVoteId } from '../lib/votes'

function makeVariant(
  o: Pick<WorkoutVariantRow, 'id' | 'familyId' | 'name' | 'category' | 'type'> &
    Partial<Pick<WorkoutVariantRow, 'label' | 'reason' | 'raceTypes'>>,
): WorkoutVariantRow {
  return {
    label: null, sortOrder: 1, reason: '', rawInput: '', distTime: '', energySystem: '',
    hrZone: '', rpe: '', coachingNotes: null, mapLink: null, distanceMiles: null,
    elevationGainFeet: null, geometry: null, mapImageUrl: null, routeNarrative: null,
    author: null, raceTypes: [], trainingPhases: [], hasTurnaround: false, turnaround: '',
    flagged: false, flagNote: '', runGroupId: null, lastRan: null, ...o,
  }
}

const hills = makeVariant({ id: 1, familyId: 10, name: 'Fort Greene Hills', category: 'Quality', type: 'Hills', raceTypes: ['5K'] })
const ladder = makeVariant({ id: 2, familyId: 20, name: 'Track Ladder', category: 'Quality', type: 'Ladder' })
const easy = makeVariant({ id: 3, familyId: 30, name: 'McCarren Easy Loop', category: 'Easy', type: 'Easy' })
const all = [hills, ladder, easy]

describe('activeFilterCount / activeFilterSummary', () => {
  test('empty filters → 0 and an empty summary', () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0)
    expect(activeFilterSummary(EMPTY_FILTERS)).toBe('')
  })

  test('counts and summarizes each active facet in order', () => {
    const f: LibraryFilters = { category: 'Quality', type: 'Hills', race: '5K', rating: 'good', showAllRuns: true }
    expect(activeFilterCount(f)).toBe(5)
    expect(activeFilterSummary(f)).toBe('Quality · Hills · 5K · 😃 & up · All runs')
  })

  test('"any" rating and "Your run" scope are not counted', () => {
    const f: LibraryFilters = { ...EMPTY_FILTERS, category: 'Easy' }
    expect(activeFilterCount(f)).toBe(1)
    expect(activeFilterSummary(f)).toBe('Easy')
  })
})

describe('matchesQuery', () => {
  test('empty query matches everything', () => {
    expect(matchesQuery(hills, '')).toBe(true)
    expect(matchesQuery(hills, '   ')).toBe(true)
  })
  test('matches name, type, and race type case-insensitively', () => {
    expect(matchesQuery(hills, 'fort')).toBe(true)
    expect(matchesQuery(hills, 'hills')).toBe(true)
    expect(matchesQuery(hills, '5k')).toBe(true)
    expect(matchesQuery(hills, 'ladder')).toBe(false)
  })
})

describe('applyLibraryFilters', () => {
  const noVotes: Record<string, VoteData | null> = {}
  test('category + type + race AND together', () => {
    const f: LibraryFilters = { ...EMPTY_FILTERS, category: 'Quality' }
    expect(applyLibraryFilters(all, f, '', noVotes).map(w => w.id)).toEqual([1, 2])
    expect(applyLibraryFilters(all, { ...f, type: 'Hills' }, '', noVotes).map(w => w.id)).toEqual([1])
    expect(applyLibraryFilters(all, { ...f, race: '5K' }, '', noVotes).map(w => w.id)).toEqual([1])
  })
  test('query ANDs with the facets', () => {
    expect(applyLibraryFilters(all, EMPTY_FILTERS, 'mccarren', noVotes).map(w => w.id)).toEqual([3])
  })
  test('rating threshold ANDs: a zero-vote row fails any non-"any" threshold', () => {
    const votes = { [workoutVoteId(hills.name, '')]: { avg: 5, count: 4 } as VoteData }
    const f: LibraryFilters = { ...EMPTY_FILTERS, rating: 'good' }
    expect(applyLibraryFilters(all, f, '', votes).map(w => w.id)).toEqual([1]) // only the rated row survives
  })
})

describe('reset rules (withCategory / withScope)', () => {
  test('changing category clears the type filter', () => {
    const f: LibraryFilters = { ...EMPTY_FILTERS, category: 'Quality', type: 'Hills' }
    expect(withCategory(f, 'Easy')).toEqual({ ...EMPTY_FILTERS, category: 'Easy' })
  })
  test('toggling scope clears category and type but keeps race/rating', () => {
    const f: LibraryFilters = { category: 'Quality', type: 'Hills', race: '5K', rating: 'good', showAllRuns: false }
    expect(withScope(f, true)).toEqual({ category: null, type: null, race: '5K', rating: 'good', showAllRuns: true })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- libraryFilters`
Expected: FAIL — `Cannot find module '../lib/libraryFilters'`.

- [ ] **Step 3: Write the implementation**

Create `lib/libraryFilters.ts`:

```ts
import type { WorkoutVariantRow } from './data'
import type { VoteData } from './votes'
import { workoutVoteId } from './votes'
import { passesRatingThreshold, type RatingThreshold } from './rating'

// Story 1A: the Library picker's filter state, extracted from LibraryClient so the
// "what's active / how to summarize / how resets cascade / how to filter" logic is
// pure and unit-tested, and reusable by the Schedule picker (Story 1B).
export type LibraryFilters = {
  category: string | null
  type: string | null
  race: string | null
  rating: RatingThreshold
  showAllRuns: boolean
}

export const EMPTY_FILTERS: LibraryFilters = {
  category: null, type: null, race: null, rating: 'any', showAllRuns: false,
}

// Short labels for the active-filter summary on the Filters button (matches the
// RatingFilter dropdown wording, minus "any").
const RATING_SUMMARY: Record<Exclude<RatingThreshold, 'any'>, string> = {
  ok: '😐 & up', good: '😃 & up', love: '🥳 only',
}

export function activeFilterCount(f: LibraryFilters): number {
  let n = 0
  if (f.category) n++
  if (f.type) n++
  if (f.race) n++
  if (f.rating !== 'any') n++
  if (f.showAllRuns) n++
  return n
}

export function activeFilterSummary(f: LibraryFilters): string {
  const parts: string[] = []
  if (f.category) parts.push(f.category)
  if (f.type) parts.push(f.type)
  if (f.race) parts.push(f.race)
  if (f.rating !== 'any') parts.push(RATING_SUMMARY[f.rating])
  if (f.showAllRuns) parts.push('All runs')
  return parts.join(' · ')
}

export function matchesQuery(w: WorkoutVariantRow, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    w.name.toLowerCase().includes(q) ||
    w.type.toLowerCase().includes(q) ||
    (w.label ?? '').toLowerCase().includes(q) ||
    w.reason.toLowerCase().includes(q) ||
    w.raceTypes.some(r => r.toLowerCase().includes(q))
  )
}

// The facet + query + rating pipeline, lifted verbatim from LibraryClient's
// filteredBase (the scope/visibleVariants step stays in the component — it depends
// on run-library membership, not on this pure filter state). Sort is applied by the
// caller and is unchanged in this story.
export function applyLibraryFilters(
  variants: WorkoutVariantRow[],
  f: LibraryFilters,
  query: string,
  voteData: Record<string, VoteData | null>,
): WorkoutVariantRow[] {
  return variants
    .filter(w => !f.category || w.category === f.category)
    .filter(w => !f.type || w.type === f.type)
    .filter(w => !f.race || w.raceTypes.includes(f.race))
    .filter(w => matchesQuery(w, query))
    .filter(w => passesRatingThreshold(voteData[workoutVoteId(w.name, w.label ?? '')], f.rating))
}

// Reset rules, mirroring LibraryClient's setcat (category change clears type) and
// setScope (scope toggle clears category + type so the two scopes stay independent).
export function withCategory(f: LibraryFilters, category: string | null): LibraryFilters {
  return { ...f, category, type: null }
}

export function withScope(f: LibraryFilters, showAllRuns: boolean): LibraryFilters {
  return { ...f, showAllRuns, category: null, type: null }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:unit -- libraryFilters`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/libraryFilters.ts __tests__/libraryFilters.test.ts
git commit -m "feat(#NNN): pure Library filter model (state, summary, resets, filter pipeline)"
```

---

### Task 2: Shared Model C primitives — `SortControl`, `FiltersButton`, `FilterSheet`

**Files:**
- Create: `components/SortControl.tsx`
- Create: `components/FiltersButton.tsx`
- Create: `components/FilterSheet.tsx`

**Interfaces:**
- Consumes: `filterChip` (`lib/cardStyles`) for pill styling where useful; no business logic.
- Produces:
  - `SortControl<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void })` — a trigger button (accessible name "Change sort order") showing the current label, and a popover menu of option buttons (accessible name = each label). Closes on outside click and on selection. (The asc/desc direction toggle is Story 2 — not here.)
  - `FiltersButton({ count, summary, onOpen }: { count: number; summary: string; onOpen: () => void })` — reads `Filters` when `summary` is empty, otherwise `Filters · <summary>` (truncated); shows a cyan count badge when `count > 0`; `onOpen` opens the sheet.
  - `FilterSheet({ open, onClose, onClear, children }: { open: boolean; onClose: () => void; onClear: () => void; children: React.ReactNode })` — a bottom drawer with a scrim; renders `children` (the facet controls), plus `Clear all` (calls `onClear`) and `Show results` (calls `onClose`) actions. Closes on scrim click and Escape.

These are presentational — no vitest coverage (node-env). Verified by tsc, lint, and the Preview URL in Task 5.

- [ ] **Step 1: Create `components/SortControl.tsx`**

```tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { filterChip } from '@/lib/cardStyles'

// Story 1A: the sort control shell — a trigger + popover menu. Generic over the
// sort value so Library (recent|rating) and later surfaces reuse it. Story 2 adds
// the ascending/descending direction toggle alongside this field selector.
export default function SortControl<T extends string>({
  value, options, onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = options.find(o => o.value === value)?.label ?? ''

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Change sort order"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        className="font-display uppercase tracking-[0.1em] text-[11px] font-medium text-ink border border-line px-3 py-1.5 touch-manipulation whitespace-nowrap"
      >
        {current} ▾
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-1 z-20 bg-card border border-ink min-w-[150px]">
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              role="menuitem"
              onClick={() => { onChange(o.value); setOpen(false) }}
              className={`block w-full text-left font-display uppercase tracking-[0.08em] text-[11px] px-3 py-2 touch-manipulation border-b border-line last:border-b-0 ${o.value === value ? 'bg-ink text-white' : 'text-ink'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create `components/FiltersButton.tsx`**

```tsx
'use client'

// Story 1A: the Filters button carries the active-filter summary inline (Model C
// decision: no separate chip row). Reads "Filters" when nothing is active.
export default function FiltersButton({
  count, summary, onOpen,
}: {
  count: number
  summary: string
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={count > 0 ? `Filters, ${count} active` : 'Filters'}
      className={`flex items-center gap-2 min-w-0 max-w-full border px-3 py-2 touch-manipulation font-display uppercase tracking-[0.08em] text-[11px] font-medium text-ink ${count > 0 ? 'border-ink' : 'border-line'}`}
    >
      <span className="truncate">{summary ? `Filters · ${summary}` : 'Filters'}</span>
      {count > 0 && (
        <span className="shrink-0 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-link text-black text-[10px] font-semibold">
          {count}
        </span>
      )}
    </button>
  )
}
```

- [ ] **Step 3: Create `components/FilterSheet.tsx`**

```tsx
'use client'

import { useEffect } from 'react'

// Story 1A: bottom-sheet container for the filter facets. Presentational — the
// facet controls are passed as children by each client.
export default function FilterSheet({
  open, onClose, onClear, children,
}: {
  open: boolean
  onClose: () => void
  onClear: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-label="Filters" className="absolute left-0 right-0 bottom-0 bg-card border-t border-ink max-h-[86%] overflow-y-auto p-4 flex flex-col gap-4">
        {children}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClear} className="flex-1 font-display uppercase tracking-[0.1em] text-[11px] font-medium text-ink border border-line py-3 touch-manipulation">Clear all</button>
          <button type="button" onClick={onClose} className="flex-1 font-display uppercase tracking-[0.1em] text-[11px] font-medium text-white bg-ink border border-ink py-3 touch-manipulation">Show results</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verify it compiles and lints**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors from the three new files.

- [ ] **Step 5: Commit**

```bash
git add components/SortControl.tsx components/FiltersButton.tsx components/FilterSheet.tsx
git commit -m "feat(#NNN): shared Model C primitives (SortControl, FiltersButton, FilterSheet)"
```

---

### Task 3: Wire `LibraryClient` to Model C

**Files:**
- Modify: `components/LibraryClient.tsx` (imports; filter derivation ~L100-133; control JSX ~L222-289)

**Interfaces:**
- Consumes: everything from Tasks 1-2 (`LibraryFilters`, `applyLibraryFilters`, `activeFilterCount`, `activeFilterSummary`, `withCategory`, `withScope`, `SortControl`, `FiltersButton`, `FilterSheet`).
- Produces: no new exports — the page renders the Model C surface with unchanged results and sort behaviour.

This task is verified on the Preview URL (Task 5) and by the e2e updates (Task 4), not by unit tests.

- [ ] **Step 1: Add imports and sheet state**

In `components/LibraryClient.tsx`, add to the imports:

```tsx
import SortControl from '@/components/SortControl'
import FiltersButton from '@/components/FiltersButton'
import FilterSheet from '@/components/FilterSheet'
import {
  applyLibraryFilters, activeFilterCount, activeFilterSummary, withCategory, withScope,
  type LibraryFilters,
} from '@/lib/libraryFilters'
```

Add one state hook alongside the existing ones (after line 61):

```tsx
const [sheetOpen, setSheetOpen] = useState(false)
```

- [ ] **Step 2: Derive the filter object and use the shared pipeline**

Replace the `matchesSearch` definition and `filteredBase` block (current lines ~102-128) with a derived `LibraryFilters` and the shared helper. Keep `visibleVariants`, `types`, and the `filtered` sort line unchanged:

```tsx
// Model C: the facet state assembled into one object the shared helpers operate on.
const filters: LibraryFilters = { category, type: typeFilter, race: raceFilter, rating: ratingThreshold, showAllRuns }
const filterCount = activeFilterCount(filters)
const filterSummary = activeFilterSummary(filters)

const filteredBase = applyLibraryFilters(visibleVariants, filters, search, voteData)
```

Leave the existing `filtered` line (`sortBy === 'rating' ? rankByRating(...) : [...].sort(...)`) exactly as is — sort is unchanged in this story. Delete the now-unused `q`/`matchesSearch` and `effectiveCategory` locals if nothing else references them (grep first; `types`/`presentTypes` use `effectiveCategory`, so keep `const effectiveCategory = category` if still referenced).

- [ ] **Step 3: Replace `setcat`/`setScope` bodies with the pure reducers**

Rewrite the two handlers (current lines ~169-185) to drive state through the tested reducers so the reset rules stay in one place:

```tsx
function setcat(c: string | null) {
  const next = withCategory(filters, c)
  setCategory(next.category)
  setTypeFilter(next.type)
}

function setScope(all: boolean) {
  const next = withScope(filters, all)
  setShowAllRuns(next.showAllRuns)
  setCategory(next.category)
  setTypeFilter(next.type)
}
```

- [ ] **Step 4: Replace the control JSX block with the Model C surface**

Replace the whole control region (current lines ~222-289: the scope+rating row, the search block, the category row, the race row, the type row, and the sort toggle) with:

```tsx
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
    value={sortBy}
    options={[{ value: 'recent', label: 'Least recent' }, { value: 'rating', label: 'Top rated' }]}
    onChange={setSortBy}
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
  onClear={() => { setCategory(null); setTypeFilter(null); setRaceFilter(null); setRatingThreshold('any'); setShowAllRuns(false) }}
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

  <div>
    <p className="font-display uppercase tracking-[0.18em] text-[9px] font-semibold text-muted mb-2">Rating</p>
    <RatingFilter value={ratingThreshold} onChange={setRatingThreshold} />
  </div>
</FilterSheet>
```

Keep the count line at the top (line ~190) and the abbreviation-key control and `+ Add` button exactly as they are.

- [ ] **Step 5: Verify it compiles and lints**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors; no unused-variable warnings (remove any now-dead `q`/`matchesSearch` leftovers).

- [ ] **Step 6: Commit**

```bash
git add components/LibraryClient.tsx
git commit -m "feat(#NNN): Library adopts Model C surface (top bar + Filters sheet)"
```

---

### Task 4: Update the e2e specs to the Model C interaction

**Files:**
- Modify: `e2e/library.spec.ts` (every scope/category button click now opens the sheet first)
- Modify: `e2e/browse-reskin-contract.spec.ts` (the sort-toggle test now uses the dropdown)

**Interfaces:**
- Consumes: the Model C DOM from Task 3 (Filters button, sheet with role="dialog", SortControl trigger labelled "Change sort order").

- [ ] **Step 1: Add a sheet helper and update `library.spec.ts` scope/category clicks**

At the top of `e2e/library.spec.ts`, add a helper:

```ts
async function openFilters(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Filters', exact: false }).first().click()
  await expect(page.getByRole('dialog', { name: 'Filters' })).toBeVisible()
}
```

Then, for every existing `await page.getByRole('button', { name: 'All runs', exact: true }).click()` / `'Your run'` / `'Quality'` (lines ~35, ~42, ~62, ~180, ~188), precede it with `await openFilters(page)` and follow the selection with `await page.getByRole('button', { name: 'Show results', exact: true }).click()`. Concrete example for the AC2 test:

```ts
// before: await page.getByRole('button', { name: 'All runs', exact: true }).click()
await openFilters(page)
await page.getByRole('button', { name: 'All runs', exact: true }).click()
await page.getByRole('button', { name: 'Show results', exact: true }).click()
// ...assert catalog…
await openFilters(page)
await page.getByRole('button', { name: 'Quality', exact: true }).click()
await page.getByRole('button', { name: 'Show results', exact: true }).click()
```

The count-line assertions (e.g. `'17 workouts · oldest first'`) and all `getByText(...)` workout-name assertions stay unchanged — the list and count behaviour is identical.

- [ ] **Step 2: Update the `browse-reskin-contract.spec.ts` sort-toggle test**

Replace the sort-chip clicks (lines ~48/50) with the dropdown interaction; the count-line assertions stay:

```ts
await expect(page.getByText(/workouts · oldest first/)).toBeVisible()
await page.getByRole('button', { name: 'Change sort order' }).click()
await page.getByRole('menuitem', { name: 'Top rated', exact: true }).click()
await expect(page.getByText(/workouts · top rated/)).toBeVisible()
await page.getByRole('button', { name: 'Change sort order' }).click()
await page.getByRole('menuitem', { name: 'Least recent', exact: true }).click()
await expect(page.getByText(/workouts · oldest first/)).toBeVisible()
```

The "search filters the list" test in the same file is unchanged (search stays on the top bar).

- [ ] **Step 3: Run the affected e2e specs**

Run: `npm run test:e2e -- library browse-reskin-contract`
Expected: PASS. (Runs locally against `.env.test` / test-data, per the repo's local-e2e setup.)

- [ ] **Step 4: Commit**

```bash
git add e2e/library.spec.ts e2e/browse-reskin-contract.spec.ts
git commit -m "test(#NNN): e2e drives Library filters via the Model C sheet + sort dropdown"
```

---

### Task 5: Preview verification + accessibility sweep

**Files:** none (verification only). Push the branch so Vercel builds a Preview.

- [ ] **Step 1: Full local gate**

Run: `npx tsc --noEmit && npm run lint && npm run test:unit && npm run test:e2e -- library browse-reskin-contract`
Expected: all green.

- [ ] **Step 2: Verify on the Preview URL (sign in as the test leader)**

On the Library page, confirm:
- With no filters, the button reads **Filters** (no badge); the list and count line match today.
- Opening the sheet, setting Category → Quality, Type, a Race, a Rating, and All runs, then **Show results**: the button reads **Filters · …** with the correct count badge, and the list narrows exactly as before.
- A long summary **truncates** on a phone-width viewport (≤360px) — the top bar does not wrap or overflow.
- Typing in search then opening/closing the sheet **preserves** the search text; changing the sort preserves it too.
- Category change clears the Type pills; toggling scope clears Category and Type.
- Scrim tap and Escape close the sheet; **Clear all** resets every facet.

- [ ] **Step 3: Accessibility check**

Confirm: the sort trigger is reachable and labelled ("Change sort order"); the sheet is a labelled dialog; every pill/button has `touch-manipulation`; the Filters button exposes its active count via `aria-label`. Tab order through top bar → Filters → sheet is sane.

- [ ] **Step 4: Wiki + PR**

- Update the **Architecture Overview** wiki page's picker/library section to describe the Model C surface (the "update the doc in the same change" rule).
- Open the PR with the **Test plan (Claude)** and **Manual steps (Lou)** sections and the full AC list from the story. Tell Lou the file count and that `/review` should run before merge.

---

## Self-Review

**Spec coverage:** This plan implements the spec's "picker surface" (top bar, Filters button with active summary, sheet), "applied to Library", and "filter unification" (race-type present) for the Library half. The axis-aware distance slider, the A–Z/direction/never-ran sort model, the Schedule half, and the Beginner-Friendly merge are explicitly out of scope (Stories 1B/2/3/4) and noted in Global Constraints. No in-scope requirement is unaddressed.

**Placeholder scan:** `#NNN` in commit messages is the one intentional placeholder — the Story 1A issue number, assigned at PUBLISH. No TODOs, no "handle edge cases", every code step shows real code.

**Type consistency:** `LibraryFilters` fields (`category`/`type`/`race`/`rating`/`showAllRuns`) are used identically in Tasks 1 and 3. `SortControl`'s `value: T`/`options`/`onChange` match the `sortBy: 'recent' | 'rating'` usage. `activeFilterCount`/`activeFilterSummary`/`withCategory`/`withScope` signatures match their call sites.

**Review Focus:** empty-summary, reset-cascade, and rating-AND are each pinned by a Task 1 unit test; summary-truncation and sheet-preserves-search are no-DOM concerns pinned to Task 5 Preview checks (named there because vitest can't exercise them). The section is complete, not skipped.
