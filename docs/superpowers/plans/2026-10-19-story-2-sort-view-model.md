# Story 2 — Sort / view model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give both pickers a real sort model — add an **A–Z** sort and an **ascending/descending direction toggle** to the existing Least-recent / Top-rated sorts, fix the **never-ran bug** (the Least-recent sort currently floats never-run workouts to the top), and surface the never-ran exclusion in the count line.

**Architecture:** Today the sort is inline in each client (`LibraryClient` line 124-126, `ScheduleClient` line 205-229, plus `lib/schedulePicker.ts:51`) and coerces a null `lastRan` to `'0'`, which sorts never-run workouts *first* in "Least recent." This story extracts the sort into a pure, unit-tested `lib/variantSort.ts` used by both clients: `sortVariants(rows, field, dir, voteData)`. The key semantic fix — **"recent" is a last-ran ordering, so never-ran rows are excluded from it** (not coerced to `'0'`) — lives in that helper and is pinned by unit tests. `SortControl` (from 1A) gains a direction toggle. Each client tracks `sortField` + `sortDir` and, on a field change, resets direction to that field's default.

**Tech Stack:** Next.js App Router, React client components, vitest (node-env) for the pure sort, Playwright for the sort e2e.

**Spec:** `docs/superpowers/specs/2026-10-18-axis-aware-picker-redesign-design.md`

## Global Constraints

- **Depends on 1A (#530) + 1B (#532)** — both merged; `SortControl`, both clients on Model C, `sortBy: 'recent' | 'rating'` state are on `main`.
- **No schema migration.**
- **Scope = sort only.** The distance sort (Story 4 / #461) is explicitly deferred — `SortField` here is `'recent' | 'rating' | 'az'`. (See the note on the dropped rating *filter* below — not this story's job.)
- **NBR tokens only**; `touch-manipulation` on the new direction control; it needs an `aria-label`.
- **Sort options are the same on both pages** (Least recent / Top rated / A–Z) so the control reads identically, per the shared-surface goal.
- vitest node-env: the sort helper is unit-tested; `SortControl`'s direction UI and the count-line wording are verified on Preview + the updated Playwright specs.

## Review Focus

- **Never-run workouts do NOT appear in the Least-recent view** (the bug: `?? '0'` floated them to the top) and DO appear in A–Z. (Pinned by Task 1 `sortVariants` tests.)
- **Changing the sort field resets direction to that field's default** (Recent→oldest-first, Top→highest, A–Z→A→Z); flipping reverses a stable order without dropping or duplicating rows. (Pinned by Task 1 tests.)
- **The Library default count line changes** — the label becomes `Last ran, oldest first` (dimension+direction wording), and the count may drop if any fixture is never-ran (now excluded) — so `e2e/library.spec.ts`'s `17 workouts · oldest first` assertion must be updated. (Task 5 Step 1 handles both.)
- **Top-rated sort still uses the weighted `rankByRating`** (unchanged); A–Z uses `localeCompare`. (Task 1.)
- **The count-line label stays a reliable behavioral proof** for the e2e (the sort's `onChange` survived) — the label text comes from `sortCountLabel`. (Task 1 + Task 5.)

---

### Task 1: Pure sort model — `lib/variantSort.ts`

**Files:**
- Create: `lib/variantSort.ts`
- Test: `__tests__/variantSort.test.ts`

**Interfaces:**
- Consumes: `WorkoutVariantRow` (`lib/data`), `VoteData` (`lib/votes`), `rankByRating` (`lib/rating`).
- Produces:
  - `type SortField = 'recent' | 'rating' | 'az'`
  - `type SortDir = 'asc' | 'desc'`
  - `DEFAULT_DIR: Record<SortField, SortDir>`
  - `SORT_LABELS: Record<SortField, string>` — `{ recent: 'Last ran', rating: 'Rating', az: 'A–Z' }`
  - `directionApplies(field: SortField): boolean` — `false` for `rating`, else `true`
  - `sortCountLabel(field: SortField, dir: SortDir): string`
  - `sortVariants(rows: WorkoutVariantRow[], field: SortField, dir: SortDir, voteData: Record<string, VoteData | null>): WorkoutVariantRow[]`

- [ ] **Step 1: Write the failing test**

Create `__tests__/variantSort.test.ts` (fixture mirrors the other `__tests__` files):

```ts
import { describe, test, expect } from 'vitest'
import { sortVariants, DEFAULT_DIR, sortCountLabel, directionApplies } from '../lib/variantSort'
import type { WorkoutVariantRow } from '../lib/data'
import type { VoteData } from '../lib/votes'
import { workoutVoteId } from '../lib/votes'

function v(o: Pick<WorkoutVariantRow, 'id' | 'name'> & Partial<Pick<WorkoutVariantRow, 'lastRan' | 'label'>>): WorkoutVariantRow {
  return {
    familyId: o.id, category: 'Quality', type: 'Hills', label: null, sortOrder: 1, reason: '',
    rawInput: '', distTime: '', energySystem: '', hrZone: '', rpe: '', coachingNotes: null,
    mapLink: null, distanceMiles: null, elevationGainFeet: null, geometry: null, mapImageUrl: null,
    routeNarrative: null, author: null, raceTypes: [], trainingPhases: [], hasTurnaround: false,
    turnaround: '', flagged: false, flagNote: '', runGroupId: null, lastRan: null, ...o,
  }
}

const a = v({ id: 1, name: 'Alpha', lastRan: '2026-03-01' })
const b = v({ id: 2, name: 'Bravo', lastRan: '2026-01-01' })
const never = v({ id: 3, name: 'Charlie', lastRan: null })
const rows = [a, b, never]
const noVotes: Record<string, VoteData | null> = {}

describe('sortVariants — recent excludes never-ran (the #NNN bug fix)', () => {
  test('ascending (oldest first) drops the never-ran row entirely', () => {
    const out = sortVariants(rows, 'recent', 'asc', noVotes)
    expect(out.map(r => r.id)).toEqual([2, 1]) // Bravo (older) then Alpha; Charlie excluded
  })
  test('descending (most recent first) still excludes never-ran', () => {
    expect(sortVariants(rows, 'recent', 'desc', noVotes).map(r => r.id)).toEqual([1, 2])
  })
})

describe('sortVariants — A–Z includes everything', () => {
  test('ascending is by name, never-ran included', () => {
    expect(sortVariants(rows, 'az', 'asc', noVotes).map(r => r.name)).toEqual(['Alpha', 'Bravo', 'Charlie'])
  })
  test('descending reverses', () => {
    expect(sortVariants(rows, 'az', 'desc', noVotes).map(r => r.name)).toEqual(['Charlie', 'Bravo', 'Alpha'])
  })
})

describe('sortVariants — rating uses the weighted rank', () => {
  test('a well-voted high beats a one-vote high; direction flips the order', () => {
    const votes = {
      [workoutVoteId('Alpha', '')]: { avg: 4.5, count: 20 } as VoteData,
      [workoutVoteId('Bravo', '')]: { avg: 5.0, count: 1 } as VoteData,
    }
    const desc = sortVariants([a, b, never], 'rating', 'desc', votes).map(r => r.id)
    expect(desc[0]).toBe(1) // Alpha (confidence-weighted) leads a 1-vote 5.0
    const asc = sortVariants([a, b, never], 'rating', 'asc', votes).map(r => r.id)
    expect(asc).toEqual([...desc].reverse())
  })
})

describe('defaults + labels', () => {
  test('default directions', () => {
    expect(DEFAULT_DIR).toEqual({ recent: 'asc', rating: 'desc', az: 'asc' })
  })
  test('count-line labels name the dimension + direction', () => {
    expect(sortCountLabel('recent', 'asc')).toBe('Last ran, oldest first')
    expect(sortCountLabel('recent', 'desc')).toBe('Last ran, most recent first')
    expect(sortCountLabel('rating', 'desc')).toBe('Rating')
    expect(sortCountLabel('az', 'asc')).toBe('A–Z')
    expect(sortCountLabel('az', 'desc')).toBe('Z–A')
  })
  test('direction applies to all but Rating', () => {
    expect(directionApplies('recent')).toBe(true)
    expect(directionApplies('az')).toBe(true)
    expect(directionApplies('rating')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- variantSort`
Expected: FAIL — `Cannot find module '../lib/variantSort'`.

- [ ] **Step 3: Write the implementation**

Create `lib/variantSort.ts`:

```ts
import type { WorkoutVariantRow } from './data'
import type { VoteData } from './votes'
import { rankByRating } from './rating'

// Story 2: the shared sort model for both pickers. Extracted from the inline sorts
// in LibraryClient / ScheduleClient / schedulePicker so the semantics live (and are
// tested) in one place. Distance sort arrives in Story 4 (#461).
export type SortField = 'recent' | 'rating' | 'az'
export type SortDir = 'asc' | 'desc'

export const DEFAULT_DIR: Record<SortField, SortDir> = {
  recent: 'asc',  // oldest (least recently run) first
  rating: 'desc', // highest first
  az: 'asc',      // A → Z
}

// Dropdown labels name the DIMENSION (a plain noun), not a direction — the arrow
// owns direction. ('Last ran' not 'Least recent'; 'Rating' not 'Top rated'.)
export const SORT_LABELS: Record<SortField, string> = {
  recent: 'Last ran', rating: 'Rating', az: 'A–Z',
}

// Direction only applies where both ends are useful. Rating is always best-first
// (lowest-first is dead weight), so the control hides the arrow for it.
export function directionApplies(field: SortField): boolean {
  return field !== 'rating'
}

// The phrase the count line echoes (after "·") — names the dimension, plus the
// direction where it applies. A reliable behavioral proof the sort's onChange fired.
export function sortCountLabel(field: SortField, dir: SortDir): string {
  if (field === 'rating') return 'Rating'
  if (field === 'az') return dir === 'asc' ? 'A–Z' : 'Z–A'
  return dir === 'asc' ? 'Last ran, oldest first' : 'Last ran, most recent first'
}

// 'recent' is a last-ran ordering, so never-ran rows (lastRan == null) are NOT part
// of it — they are excluded. This fixes the bug where null coerced to '0' floated
// never-run workouts to the top of "Least recent". 'rating' and 'az' keep every row.
// Direction flips a stable base ordering by reversing it.
export function sortVariants(
  rows: WorkoutVariantRow[],
  field: SortField,
  dir: SortDir,
  voteData: Record<string, VoteData | null>,
): WorkoutVariantRow[] {
  let out: WorkoutVariantRow[]
  if (field === 'rating') {
    out = rankByRating(rows, voteData) // high → low (its own stable order)
  } else if (field === 'az') {
    out = [...rows].sort((x, y) => x.name.localeCompare(y.name))
  } else {
    out = rows
      .filter(r => r.lastRan != null)
      .sort((x, y) => (x.lastRan! < y.lastRan! ? -1 : x.lastRan! > y.lastRan! ? 1 : 0))
  }
  return dir === DEFAULT_DIR[field] ? out : [...out].reverse()
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:unit -- variantSort`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/variantSort.ts __tests__/variantSort.test.ts
git commit -m "feat(#NNN): shared sort model — A–Z, direction, never-ran excluded from recent"
```

---

### Task 2: Add the direction toggle to `SortControl`

**Files:**
- Modify: `components/SortControl.tsx`

**Interfaces:**
- Produces (new props): `direction: 'asc' | 'desc'`, `showDirection: boolean` (hide the arrow when false — used for the Rating dimension), `onDirectionChange: () => void`, alongside the existing `value`/`options`/`onChange`.

- [ ] **Step 1: Extend the component**

Add `direction` + `onDirectionChange` to the props. Keep the existing field trigger + menu; add a direction-arrow button beside the trigger (▲ for `asc`, ▼ for `desc`) that calls `onDirectionChange`. Wrap both in the existing `div.relative`:

```tsx
export default function SortControl<T extends string>({
  value, direction, showDirection, options, onChange, onDirectionChange,
}: {
  value: T
  direction: 'asc' | 'desc'
  showDirection: boolean
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  onDirectionChange: () => void
}) {
  // …existing open/ref/current/useEffect…
  return (
    <div ref={ref} className="relative flex items-stretch">
      <button
        type="button"
        aria-label={`Change sort order, current: ${current}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        className="font-display uppercase tracking-[0.1em] text-[11px] font-medium text-ink border border-line px-3 py-1.5 touch-manipulation whitespace-nowrap"
      >
        {current} ▾
      </button>
      {showDirection && (
        <button
          type="button"
          aria-label={`Sort direction: ${direction === 'asc' ? 'ascending' : 'descending'}`}
          onClick={onDirectionChange}
          className="font-display text-[11px] text-ink border border-l-0 border-line px-2 py-1.5 touch-manipulation"
        >
          {direction === 'asc' ? '▲' : '▼'}
        </button>
      )}
      {/* …existing menu… */}
    </div>
  )
}
```

- [ ] **Step 2: Verify compile + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: errors in `LibraryClient`/`ScheduleClient` (they don't pass the new required props yet) — that's expected; Tasks 3-4 fix them. Confirm no error *inside* `SortControl.tsx` itself.

- [ ] **Step 3: Commit**

```bash
git add components/SortControl.tsx
git commit -m "feat(#NNN): SortControl gains an asc/desc direction toggle"
```

---

### Task 3: Wire `LibraryClient` through the sort model

**Files:**
- Modify: `components/LibraryClient.tsx` (state ~line 65; `filtered` ~124-126; count line ~178; `SortControl` usage ~222-225)

- [ ] **Step 1: Replace the sort state + computation**

Add the import and swap `sortBy` for `sortField`/`sortDir`:

```tsx
import { sortVariants, SORT_LABELS, DEFAULT_DIR, sortCountLabel, directionApplies, type SortField, type SortDir } from '@/lib/variantSort'
// …
const [sortField, setSortField] = useState<SortField>('recent')
const [sortDir, setSortDir] = useState<SortDir>('asc')
```

Replace the `filtered` computation (lines 124-126) with:

```tsx
const filtered = sortVariants(filteredBase, sortField, sortDir, voteData)
```

- [ ] **Step 2: Update the count line (surface the never-ran exclusion)**

Replace line ~178 with a count line that uses `sortCountLabel` and, in the Recent view, notes any hidden never-ran rows:

```tsx
const neverRanHidden = sortField === 'recent' ? filteredBase.filter(w => w.lastRan == null).length : 0
// …in JSX:
<p className="text-sm text-muted">
  {filtered.length} workouts · {sortCountLabel(sortField, sortDir)}
  {neverRanHidden > 0 ? ` · ${neverRanHidden} never-ran hidden` : ''}
</p>
```

- [ ] **Step 3: Update the `SortControl` usage**

```tsx
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
```

- [ ] **Step 4: Verify compile + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors in `LibraryClient`.

- [ ] **Step 5: Commit**

```bash
git add components/LibraryClient.tsx
git commit -m "feat(#NNN): Library uses the shared sort model (A–Z, direction, never-ran fix)"
```

---

### Task 4: Wire `ScheduleClient` through the sort model

**Files:**
- Modify: `components/ScheduleClient.tsx` (state ~83; `pickerSource` sort ~222; `rankedSource` ~227-229; resets ~298, ~317; `SortControl` ~597-600; header label ~695)

- [ ] **Step 1: Replace the sort state**

```tsx
import { sortVariants, SORT_LABELS, DEFAULT_DIR, sortCountLabel, directionApplies, type SortField, type SortDir } from '@/lib/variantSort'
// …
const [sortField, setSortField] = useState<SortField>('recent')
const [sortDir, setSortDir] = useState<SortDir>('asc')
```

- [ ] **Step 2: Route all sorting through `rankedSource`**

In `pickerSource` (line ~222), drop the trailing `.sort((a, b) => (a.lastRan ?? '0') …)` — `rankedSource` now owns ordering. Replace `rankedSource` (lines 227-229) with:

```tsx
const rankedSource = useMemo(
  () => sortVariants(pickerSource, sortField, sortDir, voteData),
  [pickerSource, sortField, sortDir, voteData],
)
```

(`lib/schedulePicker.ts:51`'s candidate ordering is now moot — `rankedSource` re-sorts and applies the never-ran exclusion — but leave it; it's harmless and removing it would widen this story into that helper's tests.)

- [ ] **Step 3: Fix the sort resets**

At both reset sites (`changeWeek` ~298, `setScope` ~317), replace `setSortBy('recent')` with:

```tsx
setSortField('recent'); setSortDir('asc')
```

- [ ] **Step 4: Update `SortControl` usage + the list header**

`SortControl` (lines ~597-600) — same props shape as Library, including `showDirection={directionApplies(sortField)}` and the three options in the order Last ran / A–Z / Rating. The list header (line ~695) currently reads `sortBy === 'rating' ? 'Workouts — top rated' : 'Workouts — least recently used'`; replace with `Workouts — ${sortCountLabel(sortField, sortDir)}` (keeps the search-mode branch as-is).

- [ ] **Step 5: Verify compile + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors; `sortBy` fully removed.

- [ ] **Step 6: Commit**

```bash
git add components/ScheduleClient.tsx
git commit -m "feat(#NNN): Schedule uses the shared sort model (A–Z, direction, never-ran fix)"
```

---

### Task 5: e2e, Preview, verification

**Files:**
- Modify: `e2e/browse-reskin-contract.spec.ts` (sort test)
- Possibly modify: `e2e/library.spec.ts` (default-count assertion, pending the fixture check)

- [ ] **Step 1: Update the Library default-count assertion (label changed; count may too)**

Two things affect the `17 workouts · oldest first` assertion at `e2e/library.spec.ts:19`:
1. **Label** — the default count line now reads `… · Last ran, oldest first` (dimension + direction wording), so the assertion string must change regardless.
2. **Count** — never-ran are excluded from the default (Last ran) view, so if any TigerWolves fixture has a null `last_ran`, the `17` drops. Check:

```bash
# test-data connection string via the Neon REST API (CLAUDE.md Tooling Notes)
psql "$TESTDATA_URL" -c "SELECT count(*) FROM run_workouts rw JOIN runs r ON r.id=rw.run_id WHERE r.id='tigerwolves' AND rw.last_ran IS NULL;"
```
- If **0**: change line 19 to `17 workouts · Last ran, oldest first` (label only).
- If **> 0**: either assert the full set under the **A–Z** view (open the dropdown → A–Z, match `/\d+ workouts · A–Z/` with the expected total, scope assertions intact), or assert the reduced Last-ran count plus the `· N never-ran hidden` suffix. The exclusion itself is pinned by Task 1 unit tests, so no new e2e is required for it.

- [ ] **Step 2: Update the sort-toggle e2e**

In `e2e/browse-reskin-contract.spec.ts` (the "sort toggle switches the ordering label" test), use the new dimension labels, add the A–Z direction flip, and assert the arrow is hidden for Rating:

```ts
await expect(page.getByText(/workouts · Last ran, oldest first/)).toBeVisible()
await page.getByRole('button', { name: 'Change sort order' }).click()
await page.getByRole('menuitem', { name: 'A–Z', exact: true }).click()
await expect(page.getByText(/workouts · A–Z/)).toBeVisible()
await page.getByRole('button', { name: /Sort direction/ }).click()           // A–Z → Z–A
await expect(page.getByText(/workouts · Z–A/)).toBeVisible()
await page.getByRole('button', { name: 'Change sort order' }).click()
await page.getByRole('menuitem', { name: 'Rating', exact: true }).click()
await expect(page.getByText(/workouts · Rating/)).toBeVisible()
await expect(page.getByRole('button', { name: /Sort direction/ })).toHaveCount(0)  // hidden for Rating
```

- [ ] **Step 3: Full local gate**

Run: `npx tsc --noEmit && npm run lint && npm run test:unit && npm run test:e2e -- library browse-reskin-contract schedule`
Expected: green.

- [ ] **Step 4: Preview checks (signed-in leader)**

- Both pages: the sort dropdown offers **Last ran / A–Z / Rating**; the direction arrow appears for Last ran and A–Z and is **hidden for Rating**; the count line echoes the active dimension + direction.
- **Last ran** no longer shows never-run workouts; **A–Z** shows them (arrow reverses A↔Z). On a run with never-ran library rows, the count line reads `… · N never-ran hidden` under Last ran.
- Schedule: changing week / scope resets the sort to **Last ran** ascending.

- [ ] **Step 5: Wiki + PR**

- Update the **Architecture Overview** wiki's picker section to the three-view sort model + never-ran rule.
- Open the PR with **Test plan (Claude)** + **Manual steps (Lou)** + the AC list. Tell Lou the file count and that `/review` should run before merge.

---

## Self-Review

**Spec coverage:** Implements the spec's "Sort / view model" in full — A–Z added, the asc/desc direction toggle with per-field defaults, the never-ran exclusion from Recent (dropping the `?? '0'` coercion), and the count-line surfacing. Distance sort is correctly deferred to Story 4. Both pages are wired through the one shared helper, per the "shared, unit-tested helpers" goal.

**Placeholder scan:** `#NNN` (the Story 2 issue number, assigned at PUBLISH) is the one intentional placeholder; `$TESTDATA_URL` is a documented connection-string stand-in. Every code step is real.

**Type consistency:** `SortField`/`SortDir`/`DEFAULT_DIR`/`SORT_LABELS`/`sortCountLabel`/`sortVariants` are defined in Task 1 and consumed with matching signatures in Tasks 3-4. `SortControl`'s new `direction`/`onDirectionChange` (Task 2) match both clients' usage.

**Review Focus:** never-ran-excluded-from-recent and direction-reset/flip are pinned by Task 1 unit tests; the Library default-count impact is explicitly re-validated in Task 5 Step 1 (query, then adjust only if needed); the count-line label is both unit-tested (`sortCountLabel`) and e2e-asserted. Section complete.
