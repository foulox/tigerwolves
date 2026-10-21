# Story 4 / #461 — Distance min-max slider (non-workout primary axis) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give non-workout runs a real primary browse axis — a **dual-thumb min-max distance slider** in the Model C Filters sheet — plus a **Distance sort** (shortest↔longest), on both the Schedule picker (for non-workout runs) and the Library (when browsing the Long/Easy categories). Surface each route's mileage on its result card so the filter is legible.

**Architecture:** `distanceMiles` is a live, nullable column (populated by the merged Strava/MapMyRun imports, #457/#458) — null for workouts. The distance axis therefore appears only in a **non-workout browse context**: Schedule when the run is not a Workout kind (your-run mode), Library when the category filter is `Long` or `Easy`. Two new pure, unit-tested helpers do the work: `lib/distanceFilter.ts` (bounds + range filter + summary) and a new `'distance'` dimension in the existing `lib/variantSort.ts`. A new presentational `components/DistanceSlider.tsx` (one-line dual-thumb, the price-filter pattern) renders in the sheet. Both clients already share `FilterSheet`/`SortControl`, so this slots into the established Model C surface.

**Tech Stack:** Next.js App Router, React client components, Tailwind v4 (NBR tokens), vitest (node-env) for the pure helpers, Playwright for e2e.

**Spec:** `docs/superpowers/specs/2026-10-18-axis-aware-picker-redesign-design.md`

## Global Constraints

- **Depends on 1A (#530) + 1B (#532) + Story 2 (#536)** — all merged; `FilterSheet`, `SortControl`, `variantSort`, `libraryFilters`, `scheduleFilters` are on `main`.
- **No schema migration** — `distanceMiles` already exists (migrate-457). Data populated via the merged import.
- **`distanceMiles` is null for workouts** — the slider and Distance sort must never appear in a Workout context, and a null distance must never be coerced to a number.
- **NBR tokens only**; `touch-manipulation` on the thumbs; the slider needs an `aria-label` per thumb.
- **Out of scope:** the route import itself (done), elevation filtering, All-runs-mode distance slider on the Schedule (the slider is your-run-non-workout only this story — see Task 5), and any Workout-context distance UI.

## Review Focus

- **A route with a null `distanceMiles` must not vanish when the slider is untouched.** Default (full-range / inactive) shows every route incl. null-distance; the range filters only once the leader narrows it. (Pinned by Task 2 `applyDistanceRange` tests.)
- **Null-distance routes under the Distance sort trail at the end, not excluded and not coerced to 0** (which would wrongly sort them first). (Pinned by Task 1 `sortVariants('distance', …)` tests.)
- **The slider/Distance-sort never render in a Workout context** — Schedule Workout run, or Library Quality/no-category. (Preview, Tasks 4-5.)
- **Bounds degrade gracefully** — zero or one distinct distance among candidates yields a sane (non-crashing, non-inverted) slider. (Pinned by Task 2 `distanceBounds` tests.)
- **Thumbs cannot cross** (min ≤ max) and the active range shows on the Filters button summary + as a count. (Task 3 Preview + Task 2 summary tests.)

---

### Task 1: Add a `distance` dimension to `lib/variantSort.ts`

**Files:**
- Modify: `lib/variantSort.ts`
- Modify: `__tests__/variantSort.test.ts`

**Interfaces:**
- Produces: `SortField` gains `'distance'`; `DEFAULT_DIR.distance = 'asc'`; `SORT_LABELS.distance = 'Distance'`; `directionApplies('distance') === true`; `sortCountLabel('distance', dir)`; `sortVariants` handles `'distance'` (ascending by `distanceMiles`, nulls last; direction respected; nulls stay last in both directions).

- [ ] **Step 1: Write the failing test**

Add to `__tests__/variantSort.test.ts`:

```ts
import { sortVariants /* …existing… */ } from '../lib/variantSort'
// reuse the existing v() fixture factory; add distanceMiles where relevant

describe('sortVariants — distance (nulls trail, never coerced to 0)', () => {
  const short = v({ id: 10, name: 'Short', lastRan: '2026-01-01' }); short.distanceMiles = 2.0
  const mid = v({ id: 11, name: 'Mid', lastRan: '2026-01-01' }); mid.distanceMiles = 5.0
  const long = v({ id: 12, name: 'Long', lastRan: '2026-01-01' }); long.distanceMiles = 9.0
  const unknown = v({ id: 13, name: 'Unknown', lastRan: '2026-01-01' }); unknown.distanceMiles = null
  const rows = [long, unknown, short, mid]
  const noVotes = {}

  test('ascending = shortest first, null distance trails', () => {
    expect(sortVariants(rows, 'distance', 'asc', noVotes).map(r => r.id)).toEqual([10, 11, 12, 13])
  })
  test('descending = longest first, null distance still trails', () => {
    expect(sortVariants(rows, 'distance', 'desc', noVotes).map(r => r.id)).toEqual([12, 11, 10, 13])
  })
})

test('distance defaults + label + direction-applies', () => {
  expect(DEFAULT_DIR.distance).toBe('asc')
  expect(sortCountLabel('distance', 'asc')).toBe('Distance, shortest first')
  expect(sortCountLabel('distance', 'desc')).toBe('Distance, longest first')
  expect(directionApplies('distance')).toBe(true)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:unit -- variantSort`
Expected: FAIL — `'distance'` not assignable to `SortField`.

- [ ] **Step 3: Implement**

In `lib/variantSort.ts`:

```ts
export type SortField = 'recent' | 'rating' | 'az' | 'distance'

export const DEFAULT_DIR: Record<SortField, SortDir> = {
  recent: 'asc', rating: 'desc', az: 'asc', distance: 'asc',
}

export const SORT_LABELS: Record<SortField, string> = {
  recent: 'Last ran', rating: 'Rating', az: 'A–Z', distance: 'Distance',
}
```

Extend `sortCountLabel` (before the final `return`):

```ts
if (field === 'distance') return dir === 'asc' ? 'Distance, shortest first' : 'Distance, longest first'
```

In `sortVariants`, handle `'distance'` with an early return (nulls trail in both directions — the generic reverse would wrongly bring them to the front):

```ts
if (field === 'distance') {
  return [...rows].sort((x, y) => {
    if (x.distanceMiles == null && y.distanceMiles == null) return 0
    if (x.distanceMiles == null) return 1   // nulls always last
    if (y.distanceMiles == null) return -1
    return dir === 'asc' ? x.distanceMiles - y.distanceMiles : y.distanceMiles - x.distanceMiles
  })
}
```

`directionApplies` already returns `true` for anything but `'rating'`, so `'distance'` is covered — no change.

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:unit -- variantSort`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/variantSort.ts __tests__/variantSort.test.ts
git commit -m "feat(#461): add Distance sort dimension (nulls trail, direction-aware)"
```

---

### Task 2: Pure distance-filter helper — `lib/distanceFilter.ts`

**Files:**
- Create: `lib/distanceFilter.ts`
- Test: `__tests__/distanceFilter.test.ts`

**Interfaces:**
- Produces:
  - `type DistRange = { min: number; max: number } | null` (null = inactive / full range)
  - `distanceBounds(rows: { distanceMiles: number | null }[]): { min: number; max: number } | null` — the overall span of present distances (floor/ceil to 0.1), or `null` if none.
  - `applyDistanceRange<T extends { distanceMiles: number | null }>(rows: T[], range: DistRange): T[]` — inactive → unchanged (null-distance rows kept); active → only rows with a distance in `[min, max]`.
  - `distanceRangeSummary(range: DistRange): string` — `'3.0–6.0 mi'`, or `''` when inactive.

- [ ] **Step 1: Write the failing test**

Create `__tests__/distanceFilter.test.ts`:

```ts
import { describe, test, expect } from 'vitest'
import { distanceBounds, applyDistanceRange, distanceRangeSummary } from '../lib/distanceFilter'

const rows = [
  { id: 1, distanceMiles: 2.0 }, { id: 2, distanceMiles: 3.8 },
  { id: 3, distanceMiles: 9.1 }, { id: 4, distanceMiles: null },
]

describe('distanceBounds', () => {
  test('span of present distances, rounded out to 0.1', () => {
    expect(distanceBounds(rows)).toEqual({ min: 2.0, max: 9.1 })
  })
  test('null when no row has a distance', () => {
    expect(distanceBounds([{ distanceMiles: null }])).toBeNull()
  })
  test('single distance yields a valid (min===max) span', () => {
    expect(distanceBounds([{ distanceMiles: 4.0 }])).toEqual({ min: 4.0, max: 4.0 })
  })
})

describe('applyDistanceRange', () => {
  test('inactive (null) keeps everything, including null-distance rows', () => {
    expect(applyDistanceRange(rows, null).map(r => r.id)).toEqual([1, 2, 3, 4])
  })
  test('active range keeps only in-range distances; null-distance drops', () => {
    expect(applyDistanceRange(rows, { min: 3, max: 6 }).map(r => r.id)).toEqual([2])
  })
})

describe('distanceRangeSummary', () => {
  test('formats an active range; empty when inactive', () => {
    expect(distanceRangeSummary({ min: 3, max: 6 })).toBe('3.0–6.0 mi')
    expect(distanceRangeSummary(null)).toBe('')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:unit -- distanceFilter`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/distanceFilter.ts`:

```ts
// Story #461: the non-workout distance axis. A route's distanceMiles is nullable
// (null for workouts, or a non-workout route not yet imported). The range is only a
// filter once the leader narrows it — until then (null) every route shows, including
// distance-unknown ones, so missing data never silently hides a route.
export type DistRange = { min: number; max: number } | null

export function distanceBounds(rows: { distanceMiles: number | null }[]): { min: number; max: number } | null {
  const ds = rows.map(r => r.distanceMiles).filter((d): d is number => d != null)
  if (ds.length === 0) return null
  return { min: Math.floor(Math.min(...ds) * 10) / 10, max: Math.ceil(Math.max(...ds) * 10) / 10 }
}

export function applyDistanceRange<T extends { distanceMiles: number | null }>(rows: T[], range: DistRange): T[] {
  if (!range) return rows
  return rows.filter(r => r.distanceMiles != null && r.distanceMiles >= range.min && r.distanceMiles <= range.max)
}

export function distanceRangeSummary(range: DistRange): string {
  return range ? `${range.min.toFixed(1)}–${range.max.toFixed(1)} mi` : ''
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:unit -- distanceFilter`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/distanceFilter.ts __tests__/distanceFilter.test.ts
git commit -m "feat(#461): pure distance-range filter helper (bounds, apply, summary)"
```

---

### Task 3: Dual-thumb `components/DistanceSlider.tsx`

**Files:**
- Create: `components/DistanceSlider.tsx`

**Interfaces:**
- Produces: `DistanceSlider({ bounds, value, onChange }: { bounds: { min: number; max: number }; value: { min: number; max: number }; onChange: (r: { min: number; max: number }) => void })` — one track, two thumbs, a filled segment, a live "min – max mi" readout; thumbs cannot cross.

Presentational — no vitest (node-env); verified on Preview in Task 6.

- [ ] **Step 1: Create the component**

```tsx
'use client'

// Story #461: one-line dual-thumb range (the price-filter pattern) for the
// non-workout distance axis. Two <input type=range> overlaid on one track;
// pointer-events gated to the thumbs; a fill marks the selected span.
export default function DistanceSlider({
  bounds, value, onChange,
}: {
  bounds: { min: number; max: number }
  value: { min: number; max: number }
  onChange: (r: { min: number; max: number }) => void
}) {
  const span = bounds.max - bounds.min
  const pct = (v: number) => (span <= 0 ? 0 : ((v - bounds.min) / span) * 100)
  return (
    <div>
      <div className="text-center text-[14px] text-ink mb-1">
        <b className="font-semibold">{value.min.toFixed(1)}</b> &ndash; <b className="font-semibold">{value.max.toFixed(1)} mi</b>
      </div>
      <div className="relative h-[34px] mx-[7px]">
        <div className="absolute top-1/2 left-0 right-0 h-[3px] -translate-y-1/2 bg-line" />
        <div className="absolute top-1/2 h-[3px] -translate-y-1/2 bg-ink" style={{ left: `${pct(value.min)}%`, right: `${100 - pct(value.max)}%` }} />
        <input
          type="range" aria-label="Minimum distance" min={bounds.min} max={bounds.max} step={0.1} value={value.min}
          onChange={e => onChange({ min: Math.min(+e.target.value, value.max), max: value.max })}
          className="dual-range absolute inset-x-0 top-0 h-[34px] w-full appearance-none bg-transparent pointer-events-none"
        />
        <input
          type="range" aria-label="Maximum distance" min={bounds.min} max={bounds.max} step={0.1} value={value.max}
          onChange={e => onChange({ min: value.min, max: Math.max(+e.target.value, value.min) })}
          className="dual-range absolute inset-x-0 top-0 h-[34px] w-full appearance-none bg-transparent pointer-events-none"
        />
      </div>
      <div className="flex justify-between text-[9px] tracking-[0.08em] uppercase text-muted mx-[7px]">
        <span>{bounds.min.toFixed(1)} mi</span><span>{bounds.max.toFixed(1)} mi</span>
      </div>
    </div>
  )
}
```

Add the thumb styling to `app/globals.css` (the `pointer-events` gating that makes two overlaid ranges work; Tailwind can't express `::-webkit-slider-thumb`):

```css
.dual-range::-webkit-slider-thumb {
  pointer-events: auto; -webkit-appearance: none; appearance: none;
  width: 17px; height: 17px; border-radius: 9999px;
  background: #fff; border: 2px solid var(--color-ink); cursor: pointer;
}
.dual-range::-moz-range-thumb {
  pointer-events: auto; width: 17px; height: 17px; border-radius: 9999px;
  background: #fff; border: 2px solid var(--color-ink); cursor: pointer;
}
```

- [ ] **Step 2: Verify compile + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors in the new file / CSS.

- [ ] **Step 3: Commit**

```bash
git add components/DistanceSlider.tsx app/globals.css
git commit -m "feat(#461): dual-thumb DistanceSlider (one-line range, NBR skin)"
```

---

### Task 4: Wire the Library (slider when category is Long/Easy)

**Files:**
- Modify: `components/LibraryClient.tsx`

The Library browses by category; the distance axis applies when the category is a **non-workout** one. Add a distance range alongside the existing filter state and show the slider in the sheet when `category === 'Long' || category === 'Easy'`.

- [ ] **Step 1: State, bounds, and the filtered pipeline**

Add imports (`DistanceSlider`, `distanceBounds`, `applyDistanceRange`, `distanceRangeSummary`, `type DistRange`), and:

```tsx
const [distRange, setDistRange] = useState<DistRange>(null)
const isDistanceCategory = category === 'Long' || category === 'Easy'
// bounds come from the category-filtered candidates (before the distance filter)
const distBounds = useMemo(() => distanceBounds(filteredBase), [filteredBase])
```

Apply the distance range after the facet pipeline, before sorting:

```tsx
const distanceFiltered = isDistanceCategory ? applyDistanceRange(filteredBase, distRange) : filteredBase
const neverRanHidden = sortField === 'recent' ? distanceFiltered.filter(w => w.lastRan == null).length : 0
const filtered = sortVariants(distanceFiltered, sortField, sortDir, voteData)
```

Reset the range when it no longer applies (category leaves Long/Easy) so a stale range can't filter an unrelated view — fold into `setcat`:

```tsx
function setcat(c: string | null) {
  const next = withCategory(filters, c)
  setCategory(next.category); setTypeFilter(next.type)
  if (c !== 'Long' && c !== 'Easy') setDistRange(null)
}
```

- [ ] **Step 2: Summary + count badge include the range**

Extend the summary/count the button shows (the shared `activeFilterSummary`/`activeFilterCount` operate on `LibraryFilters`, which has no distance — so compose here):

```tsx
const distSummary = isDistanceCategory ? distanceRangeSummary(distRange) : ''
const filterSummary = [activeFilterSummary(filters), distSummary].filter(Boolean).join(' · ')
const filterCount = activeFilterCount(filters) + (distRange ? 1 : 0)
```

- [ ] **Step 3: Render the slider in the sheet**

In the `FilterSheet`, after the Category block, add (only when the category is non-workout and there are bounds to show):

```tsx
{isDistanceCategory && distBounds && (
  <div>
    <p className="font-display uppercase tracking-[0.18em] text-[9px] font-semibold text-muted mb-2">Distance</p>
    <DistanceSlider bounds={distBounds} value={distRange ?? distBounds} onChange={setDistRange} />
  </div>
)}
```

And in the sheet's `onClear`, add `setDistRange(null)`.

- [ ] **Step 4: Distance sort option (non-workout categories only) + card mileage**

Build the sort options so `Distance` appears only for a non-workout category:

```tsx
const sortOptions = [
  { value: 'recent' as const, label: SORT_LABELS.recent },
  { value: 'az' as const, label: SORT_LABELS.az },
  { value: 'rating' as const, label: SORT_LABELS.rating },
  ...(isDistanceCategory ? [{ value: 'distance' as const, label: SORT_LABELS.distance }] : []),
]
```

Pass `options={sortOptions}` to `SortControl`. Guard the state: if the category leaves Long/Easy while `sortField === 'distance'`, reset to `'recent'` (in `setcat`). On a standalone/family result card, show the mileage when present — add to the card's meta line:

```tsx
{w.distanceMiles != null && <span className={TYPE_LABEL}>{w.distanceMiles.toFixed(1)} mi</span>}
```

(Place it beside the existing `TYPE_LABEL` type text; for family rows use the base/first variant's `distanceMiles`.)

- [ ] **Step 5: Verify compile + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/LibraryClient.tsx
git commit -m "feat(#461): Library distance slider + Distance sort for Long/Easy categories"
```

---

### Task 5: Wire the Schedule picker (slider for non-workout runs)

**Files:**
- Modify: `components/ScheduleClient.tsx`

The distance axis applies when the run is **not a Workout kind**, in your-run mode (All-runs borrow keeps its cross-kind category/type pills unchanged this story).

- [ ] **Step 1: State, bounds, pipeline**

Add the same imports and:

```tsx
const [distRange, setDistRange] = useState<DistRange>(null)
const showDistance = !showAllRuns && !isWorkout
const distBounds = useMemo(() => distanceBounds(pickerSource), [pickerSource])
```

Apply the range to the ranked list (ranked already sorts; filter before it):

```tsx
const rankedSource = useMemo(
  () => sortVariants(showDistance ? applyDistanceRange(pickerSource, distRange) : pickerSource, sortField, sortDir, voteData),
  [pickerSource, distRange, showDistance, sortField, sortDir, voteData],
)
```

Reset the range in `changeWeek`, `setScope`, and whenever `showDistance` turns false (fold `setDistRange(null)` into those resets, matching the existing filter-reset hygiene).

- [ ] **Step 2: Summary + count include the range**

```tsx
const distSummary = showDistance ? distanceRangeSummary(distRange) : ''
const filterSummary = [scheduleFilterSummary(scheduleFilters), distSummary].filter(Boolean).join(' · ')
const filterCount = scheduleFilterCount(scheduleFilters) + (distRange ? 1 : 0)
```

- [ ] **Step 3: Render the slider in the sheet**

In the `FilterSheet`, after the Scope block, add:

```tsx
{showDistance && distBounds && (
  <div>
    <p className="font-display uppercase tracking-[0.18em] text-[9px] font-semibold text-muted mb-2">Distance</p>
    <DistanceSlider bounds={distBounds} value={distRange ?? distBounds} onChange={setDistRange} />
  </div>
)}
```

Add `setDistRange(null)` to the sheet's `onClear`.

- [ ] **Step 4: Distance sort option (non-workout only) + card mileage**

```tsx
const sortOptions = [
  { value: 'recent' as const, label: SORT_LABELS.recent },
  { value: 'az' as const, label: SORT_LABELS.az },
  { value: 'rating' as const, label: SORT_LABELS.rating },
  ...(showDistance ? [{ value: 'distance' as const, label: SORT_LABELS.distance }] : []),
]
```

Pass to `SortControl`; if `showDistance` turns false while `sortField === 'distance'`, reset to `'recent'`. Show mileage on the result cards — beside the `VoteBadge`, add when present:

```tsx
{w.distanceMiles != null && <span className="text-xs text-muted">{w.distanceMiles.toFixed(1)} mi</span>}
```

(Apply to both the standalone and the family-member card rows.)

- [ ] **Step 5: Verify compile + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/ScheduleClient.tsx
git commit -m "feat(#461): Schedule distance slider + Distance sort for non-workout runs"
```

---

### Task 6: e2e, Preview, verification

**Files:**
- Modify/Add: an e2e spec exercising the Library distance slider (the signed-in, non-workout path is the richest on the Schedule side but needs a non-workout run fixture — prefer the Library Long/Easy path for a deterministic spec).

- [ ] **Step 1: Confirm fixture distance coverage**

The slider is only meaningful where routes have `distanceMiles`. Confirm the test-data fixtures for a non-workout category have distances:

```bash
psql "$TESTDATA_URL" -c "SELECT category, count(*) FILTER (WHERE distance_miles IS NOT NULL) AS with_dist, count(*) AS total FROM workout_families GROUP BY category;"
```
If Long/Easy fixtures have no distances, add a seed/fixture with `distance_miles` so the slider has bounds to render (note it in the PR).

- [ ] **Step 2: Add a Library distance e2e**

In a Library spec: switch to a non-workout **category** (open Filters → Category → Long or Easy → Show results), open Filters again, and assert a **Distance** section + the sort dropdown now offers **Distance**. Dragging a native range in Playwright is awkward — assert the control's presence and the Distance sort option/count-label rather than pixel-dragging:

```ts
await openFilters(page)
await page.getByRole('button', { name: 'Long', exact: true }).click()
await page.getByRole('button', { name: 'Show results', exact: true }).click()
await openFilters(page)
await expect(page.getByText('Distance', { exact: true })).toBeVisible()           // the sheet section
await expect(page.getByLabel('Minimum distance')).toBeVisible()
await page.getByRole('button', { name: 'Show results', exact: true }).click()
await page.getByRole('button', { name: 'Change sort order' }).click()
await expect(page.getByRole('menuitem', { name: 'Distance', exact: true })).toBeVisible()
```

- [ ] **Step 3: Full local gate**

Run: `npx tsc --noEmit && npm run lint && npm run test:unit && npm run test:e2e -- library schedule browse-reskin-contract`
Expected: green.

- [ ] **Step 4: Preview checks (signed-in leader)**

- **Schedule, a non-workout run** (Easy/Long): the sheet shows a **Distance** slider (not type pills); the sort dropdown offers **Distance**; result cards show `X mi`.
- **Schedule, a Workout run**: no slider, no Distance sort (type pills as before).
- **Library**: selecting **Long** or **Easy** reveals the Distance slider + Distance sort; selecting **Quality** (or no category) hides both.
- Dragging the thumbs narrows the list; thumbs can't cross; the Filters button reads `… · 3.0–6.0 mi` with the count badge; **Clear all** resets the range; a null-distance route shows when the slider is untouched and drops once narrowed.
- Distance sort: shortest-first, arrow flips to longest-first, null-distance routes trail.

- [ ] **Step 5: Wiki + PR**

- Update the **Architecture Overview** wiki's picker section: the axis-aware primary axis is now complete — type pills (Workout) / distance slider (non-workout) — plus the Distance sort.
- Close out the **#456 epic** note if this was its last child, and mark #461 done.
- Open the PR with **Test plan (Claude)** + **Manual steps (Lou)** + the AC list; note the file count and that `/review` should run before merge.

---

## Self-Review

**Spec coverage:** Implements the spec's "axis-aware primary axis → distance min-max slider for non-workout runs" and the "Distance sort (non-workout only)" on both surfaces, with the null-distance data rule handled explicitly (kept when inactive, dropped when narrowed, trailing under the sort). The Library gating (Long/Easy category) realizes decision B. Elevation, All-runs distance, and the import are out of scope and noted.

**Placeholder scan:** `#461` is the real issue number (not a placeholder). `$TESTDATA_URL` is a documented connection-string stand-in. Every code step is concrete.

**Type consistency:** `DistRange` and the three `distanceFilter` functions are defined in Task 2 and consumed identically in Tasks 4-5. `SortField` gains `'distance'` in Task 1 and the clients add it to `sortOptions` with matching literals. `DistanceSlider`'s `bounds`/`value`/`onChange` shape matches both call sites (`value={distRange ?? distBounds}`).

**Review Focus:** null-kept-when-inactive and null-dropped-when-narrowed are pinned by Task 2; null-trails-under-sort by Task 1; bounds-degrade by Task 2; no-slider-in-Workout-context and thumbs-can't-cross by Tasks 4-5 + the Task 6 Preview. Section complete.
