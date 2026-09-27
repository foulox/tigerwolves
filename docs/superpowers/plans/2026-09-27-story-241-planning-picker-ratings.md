# Unified Planning Picker + Rating Filter/Sort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a leader filter the Schedule browse list and the Library by runner rating (Any / 😐+ / 😃+ / 🥳) and sort by a confidence-weighted "Top rated" score, while collapsing the Schedule page's duplicate workout-type controls into a single committed-type source with a derived, removable browse chip.

**Architecture:** Add two pure helpers (`passesRatingThreshold`, `rankByRating`) in a new `lib/rating.ts`, unit-tested in isolation. Extract one presentational `RatingFilter` dropdown reused by both clients; filter/sort state stays local to each client via `useState`. On Schedule, replace the second "Your run" type-pill row with a derived removable chip whose default is the committed week type; the committed type (`activeType`/`entry.workoutType`) stays the single source of truth. No votes-store, vote-write-path, `VoteBadge`, or `ReactionPicker` changes. No schema migration.

**Tech Stack:** Next.js (App Router) client components, React `useState`/`useMemo`, TypeScript, Tailwind, vitest (node environment, `@/` alias), Upstash KV votes store (read-only here via already-fetched `voteData`).

**Spec:** `docs/superpowers/specs/2026-09-27-story-241-planning-picker-ratings-design.md` (gitignored; read from the primary checkout at that path — it does not travel to a fresh worktree).

## Global Constraints

- **Rating filter thresholds (both surfaces, verbatim):** `Any` / `😐 & up` (raw avg ≥ 3) / `😃 & up` (raw avg ≥ 4) / `🥳 only` (raw avg ≥ 5). Emoji scale is `['😡','😒','😐','😃','🥳']` = ratings 1–5 (`lib/votes.ts`).
- **No minimum vote count to filter.** Filter compares the raw average. Per-type counts stay visible on cards (existing `VoteBadge` / `ReactionPicker` unchanged).
- **`voteData` is `Record<string, VoteData | null>`** keyed by `workoutVoteId(name, label)`; `VoteData = { avg: number; count: number }`. A `null` entry OR `count === 0` means "no votes" and must fail any non-`Any` threshold. `avg` is already rounded to an integer 1–5 (`computeVoteData` in `lib/votes.ts`).
- **Bayesian sort formula (verbatim):** `score = (v/(v+m))*R + (m/(v+m))*C`, where `R` = variant raw average, `v` = variant vote count, `m = 5`, `C` = mean of `avg` across all variants that have votes (`count > 0`). Variants with no votes contribute `R = 0`, `v = 0`, so their score is `C * (m/(m)) = C`... — see Task 2 for the exact zero-vote handling.
- **No schema migration** in this story. No Neon-branch migration steps.
- **`touch-manipulation` on every new interactive element**; `aria-label` on any icon-only control. Mobile-first.
- **Tests are `*.test.ts` under `__tests__/`, node environment** (`vitest.config.ts`). No jsdom/testing-library is installed and this story does NOT add one — all automated tests are pure-function tests. Client render behavior is verified manually on the Preview URL (see Task 6).
- Filter/sort state is **local to each client** (`useState`), not lifted or persisted.

## Review Focus

- **Zero-vote / null rows under a non-`Any` threshold** — a workout with no ratings must be *excluded* by `😐+`/`😃+`/`🥳`, never treated as passing. Pinned in Task 1.
- **Few votes can't beat many under "Top rated"** — a single 🥳 (v=1) must rank *below* a well-voted 😃 (e.g. v=20, R=4). Pinned in Task 2.
- **Empty `voteData` (KV outage / no credentials)** — `rankByRating` must not divide by zero when *no* variant has votes (`C` undefined); it must return a stable order, not `NaN`s. Pinned in Task 2.
- **Non-workout run browse** — no committed type exists, so the Schedule type chip must be absent and nothing may read an undefined type; scope + rating + search + sort still render. Pinned in Task 4 / verified in Task 6.
- **Rating filter + existing filters stack** — on Library the rating filter must AND with category/type/race/search; on Schedule it must AND with the type chip / All-runs pills, not replace them. Pinned in Tasks 3 and 5.

---

### Task 1: `passesRatingThreshold` pure helper

**Files:**
- Create: `lib/rating.ts`
- Test: `__tests__/rating.test.ts`

**Interfaces:**
- Consumes: `VoteData` from `@/lib/votes` (`{ avg: number; count: number }`).
- Produces:
  - `export type RatingThreshold = 'any' | 'ok' | 'good' | 'love'`
  - `export const RATING_THRESHOLD_MIN: Record<Exclude<RatingThreshold, 'any'>, number> = { ok: 3, good: 4, love: 5 }`
  - `export function passesRatingThreshold(v: VoteData | null | undefined, threshold: RatingThreshold): boolean`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, test, expect } from 'vitest'
import { passesRatingThreshold } from '../lib/rating'
import type { VoteData } from '../lib/votes'

const v = (avg: number, count: number): VoteData => ({ avg, count })

describe('passesRatingThreshold', () => {
  test('"any" passes everything, including null and zero-vote rows', () => {
    expect(passesRatingThreshold(v(4, 10), 'any')).toBe(true)
    expect(passesRatingThreshold(null, 'any')).toBe(true)
    expect(passesRatingThreshold(undefined, 'any')).toBe(true)
    expect(passesRatingThreshold(v(0, 0), 'any')).toBe(true)
  })

  test('null / undefined / zero-vote rows fail any non-"any" threshold', () => {
    for (const t of ['ok', 'good', 'love'] as const) {
      expect(passesRatingThreshold(null, t)).toBe(false)
      expect(passesRatingThreshold(undefined, t)).toBe(false)
      expect(passesRatingThreshold(v(5, 0), t)).toBe(false) // avg looks high but no votes
    }
  })

  test('"ok" is avg >= 3', () => {
    expect(passesRatingThreshold(v(3, 2), 'ok')).toBe(true)
    expect(passesRatingThreshold(v(2, 2), 'ok')).toBe(false)
  })

  test('"good" is avg >= 4', () => {
    expect(passesRatingThreshold(v(4, 2), 'good')).toBe(true)
    expect(passesRatingThreshold(v(3, 2), 'good')).toBe(false)
  })

  test('"love" is avg >= 5', () => {
    expect(passesRatingThreshold(v(5, 2), 'love')).toBe(true)
    expect(passesRatingThreshold(v(4, 2), 'love')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/rating.test.ts`
Expected: FAIL — `passesRatingThreshold` is not exported from `lib/rating.ts` (module not found / undefined).

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/rating.ts
import type { VoteData } from './votes'

// Story #241: the four rating filter thresholds shared by the Schedule browse
// list and the Library. Filter on the RAW average (VoteData.avg, already rounded
// 1–5 in lib/votes.ts) with NO minimum vote count — the card shows counts so the
// leader judges reliability. A null entry or count === 0 means "no votes" and
// fails every non-"any" threshold (a zero-vote row is not "well-liked").
export type RatingThreshold = 'any' | 'ok' | 'good' | 'love'

export const RATING_THRESHOLD_MIN: Record<Exclude<RatingThreshold, 'any'>, number> = {
  ok: 3,
  good: 4,
  love: 5,
}

export function passesRatingThreshold(
  v: VoteData | null | undefined,
  threshold: RatingThreshold,
): boolean {
  if (threshold === 'any') return true
  if (!v || v.count === 0) return false
  return v.avg >= RATING_THRESHOLD_MIN[threshold]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/rating.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/rating.ts __tests__/rating.test.ts
git commit -m "feat(#241): add passesRatingThreshold rating filter helper"
```

---

### Task 2: `rankByRating` confidence-weighted sort helper

**Files:**
- Modify: `lib/rating.ts` (append)
- Test: `__tests__/rating.test.ts` (append)

**Interfaces:**
- Consumes: `passesRatingThreshold` context (`VoteData`), `workoutVoteId` from `@/lib/votes`, `WorkoutVariantRow` from `@/lib/data` (only `name` and `label` are read for the key).
- Produces:
  - `export const RATING_SORT_M = 5`
  - `export function ratingScore(v: VoteData | null | undefined, C: number): number`
  - `export function meanOfRatedAverages(voteData: Record<string, VoteData | null>): number`
  - `export function rankByRating<T extends { name: string; label: string | null }>(rows: T[], voteData: Record<string, VoteData | null>): T[]`

**Design notes (read before writing):**
- `m = 5`. `C` = the mean `avg` over every `voteData` entry with `count > 0`. If **no** entry has votes, `C` is `0` and every `ratingScore` is `0` — `rankByRating` must then leave the input order stable (a non-throwing no-op reorder), not produce `NaN`.
- A row with no votes (`null` / `count === 0`) has `R = 0`, `v = 0`, so `ratingScore = (0/(0+5))*0 + (5/(0+5))*C = C`. That correctly parks unrated rows at the neutral prior `C`, below any above-average rated row and above any below-average one — the desired behavior.
- Sort **descending** by score. Use a **stable** sort (`Array.prototype.sort` is stable in modern V8/Node); ties keep input order, so callers pass rows already in their default order (least-recently-run) and equal-score rows preserve that.
- `rankByRating` maps each row to its `voteData[workoutVoteId(row.name, row.label ?? '')]` — the same key the clients already use.

- [ ] **Step 1: Write the failing test (append to `__tests__/rating.test.ts`)**

```ts
import { rankByRating, ratingScore, meanOfRatedAverages, RATING_SORT_M } from '../lib/rating'
import { workoutVoteId } from '../lib/votes'

type Row = { id: number; name: string; label: string | null }
const row = (id: number, name: string): Row => ({ id, name, label: null })
const key = (name: string) => workoutVoteId(name, '')

describe('meanOfRatedAverages', () => {
  test('averages only entries with votes; ignores null and zero-vote', () => {
    const vd = {
      [key('A')]: { avg: 4, count: 10 },
      [key('B')]: { avg: 2, count: 4 },
      [key('C')]: null,
      [key('D')]: { avg: 5, count: 0 },
    }
    expect(meanOfRatedAverages(vd)).toBe(3) // (4 + 2) / 2
  })

  test('empty voteData yields C = 0', () => {
    expect(meanOfRatedAverages({})).toBe(0)
  })
})

describe('rankByRating', () => {
  test('m is 5', () => {
    expect(RATING_SORT_M).toBe(5)
  })

  test('few votes cannot beat many (1-vote 🥳 ranks below well-voted 😃)', () => {
    const rows = [row(1, 'OneVoteLove'), row(2, 'ManyVotesGood')]
    const vd = {
      [key('OneVoteLove')]: { avg: 5, count: 1 },
      [key('ManyVotesGood')]: { avg: 4, count: 20 },
    }
    const out = rankByRating(rows, vd)
    expect(out.map(r => r.id)).toEqual([2, 1]) // ManyVotesGood first
  })

  test('C correctness: an unrated row parks at the prior C, between above- and below-average rated rows', () => {
    // C = mean of rated avgs = (5 + 1) / 2 = 3
    const rows = [row(1, 'High'), row(2, 'Unrated'), row(3, 'Low')]
    const vd = {
      [key('High')]: { avg: 5, count: 30 },
      [key('Low')]: { avg: 1, count: 30 },
      // Unrated: absent from voteData
    }
    const out = rankByRating(rows, vd)
    expect(out.map(r => r.id)).toEqual([1, 2, 3]) // High, Unrated (=C), Low
  })

  test('single rated variant sorts without error', () => {
    const rows = [row(1, 'Only')]
    const vd = { [key('Only')]: { avg: 4, count: 3 } }
    expect(rankByRating(rows, vd).map(r => r.id)).toEqual([1])
  })

  test('empty voteData is a stable no-op (no NaN), input order preserved', () => {
    const rows = [row(3, 'C'), row(1, 'A'), row(2, 'B')]
    const out = rankByRating(rows, {})
    expect(out.map(r => r.id)).toEqual([3, 1, 2])
    for (const r of rows) expect(ratingScore(null, meanOfRatedAverages({}))).toBe(0)
  })

  test('ratingScore matches the formula for a rated row', () => {
    // v=20, R=4, C=3, m=5 -> (20/25)*4 + (5/25)*3 = 3.2 + 0.6 = 3.8
    expect(ratingScore({ avg: 4, count: 20 }, 3)).toBeCloseTo(3.8, 5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/rating.test.ts`
Expected: FAIL — `rankByRating` / `ratingScore` / `meanOfRatedAverages` / `RATING_SORT_M` not exported.

- [ ] **Step 3: Write minimal implementation (append to `lib/rating.ts`)**

```ts
import { workoutVoteId } from './votes'

// Story #241: confidence-weighted ("Bayesian") sort so few votes can't beat many.
//   score = (v/(v+m)) * R  +  (m/(v+m)) * C
// R = the variant's raw average, v = its vote count, m = 5 (the vote count at
// which a variant's own average starts to dominate the shared prior), C = the
// mean average across every variant that has votes. An unrated variant (v=0)
// scores exactly C — parked at the neutral prior.
export const RATING_SORT_M = 5

export function meanOfRatedAverages(
  voteData: Record<string, VoteData | null>,
): number {
  const rated = Object.values(voteData).filter(
    (v): v is VoteData => !!v && v.count > 0,
  )
  if (rated.length === 0) return 0
  return rated.reduce((sum, v) => sum + v.avg, 0) / rated.length
}

export function ratingScore(v: VoteData | null | undefined, C: number): number {
  const R = v && v.count > 0 ? v.avg : 0
  const count = v && v.count > 0 ? v.count : 0
  const m = RATING_SORT_M
  return (count / (count + m)) * R + (m / (count + m)) * C
}

export function rankByRating<T extends { name: string; label: string | null }>(
  rows: T[],
  voteData: Record<string, VoteData | null>,
): T[] {
  const C = meanOfRatedAverages(voteData)
  // Stable sort: equal scores keep input order (callers pass least-recently-run
  // order), so "Top rated" degrades gracefully to the default when scores tie.
  return rows
    .map((row, i) => ({ row, i, score: ratingScore(voteData[workoutVoteId(row.name, row.label ?? '')], C) }))
    .sort((a, b) => (b.score - a.score) || (a.i - b.i))
    .map(x => x.row)
}
```

Note: the `import type { VoteData }` line from Task 1 already exists at the top of the file; do not duplicate it. Move the `workoutVoteId` import to the top with the other imports.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/rating.test.ts`
Expected: PASS (all Task 1 + Task 2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/rating.ts __tests__/rating.test.ts
git commit -m "feat(#241): add rankByRating confidence-weighted sort helper"
```

---

### Task 3: Shared `RatingFilter` presentational dropdown

**Files:**
- Create: `components/RatingFilter.tsx`
- Test: `__tests__/rating.test.ts` (append a label-mapping helper test — see note)

**Interfaces:**
- Consumes: `RatingThreshold`, `RATING_THRESHOLD_MIN` from `@/lib/rating`.
- Produces:
  - `export const RATING_FILTER_OPTIONS: { value: RatingThreshold; label: string }[]` — `[{value:'any',label:'Any rating'},{value:'ok',label:'😐 & up'},{value:'good',label:'😃 & up'},{value:'love',label:'🥳 only'}]`
  - `export default function RatingFilter({ value, onChange, className }: { value: RatingThreshold; onChange: (t: RatingThreshold) => void; className?: string }): JSX.Element`

**Design notes:**
- Presentational only — no state of its own beyond the native `<select>`. A native `<select>` is the simplest mobile-safe dropdown and needs no outside-click handling; use it rather than a custom popover.
- `RATING_FILTER_OPTIONS` is exported so the label↔value mapping is testable in the node environment without rendering.
- Add `aria-label="Filter by rating"` on the `<select>` (icon/emoji-only option text, no visible field label).
- Style to sit inline on the scope-toggle row: `text-xs font-semibold rounded-full border border-gray-200 bg-white px-3 py-1.5 touch-manipulation`, accept a `className` for right-alignment (`ml-auto`) from the caller.

- [ ] **Step 1: Write the failing test (append to `__tests__/rating.test.ts`)**

```ts
import { RATING_FILTER_OPTIONS } from '../components/RatingFilter'

describe('RATING_FILTER_OPTIONS', () => {
  test('exposes the four spec thresholds in order with the right labels', () => {
    expect(RATING_FILTER_OPTIONS.map(o => o.value)).toEqual(['any', 'ok', 'good', 'love'])
    expect(RATING_FILTER_OPTIONS.map(o => o.label)).toEqual([
      'Any rating', '😐 & up', '😃 & up', '🥳 only',
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/rating.test.ts`
Expected: FAIL — `RATING_FILTER_OPTIONS` not exported from `components/RatingFilter`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// components/RatingFilter.tsx
'use client'

import type { RatingThreshold } from '@/lib/rating'

// Story #241: the shared rating filter dropdown, reused by ScheduleClient and
// LibraryClient. Presentational — the selected threshold lives in each client's
// own useState. Filters on the raw average (see passesRatingThreshold); no
// minimum vote count.
export const RATING_FILTER_OPTIONS: { value: RatingThreshold; label: string }[] = [
  { value: 'any', label: 'Any rating' },
  { value: 'ok', label: '😐 & up' },
  { value: 'good', label: '😃 & up' },
  { value: 'love', label: '🥳 only' },
]

export default function RatingFilter({
  value,
  onChange,
  className = '',
}: {
  value: RatingThreshold
  onChange: (t: RatingThreshold) => void
  className?: string
}) {
  return (
    <select
      aria-label="Filter by rating"
      value={value}
      onChange={e => onChange(e.target.value as RatingThreshold)}
      className={`text-xs font-semibold rounded-full border border-gray-200 bg-white px-3 py-1.5 touch-manipulation ${className}`}
    >
      {RATING_FILTER_OPTIONS.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/rating.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/RatingFilter.tsx __tests__/rating.test.ts
git commit -m "feat(#241): add shared RatingFilter dropdown component"
```

---

### Task 4: Schedule IA — collapse the duplicate type row into a derived, removable chip

**Files:**
- Modify: `components/ScheduleClient.tsx` — the top "WORKOUT TYPE" card + its `availableTypes` pill block (`components/ScheduleClient.tsx:443-473`), and the "Your run" browse area just below the scope toggle (`components/ScheduleClient.tsx:546-580`).
- Test: none new (pure logic already covered by `lib/schedulePicker.ts` tests; this is a render/IA change verified in Task 6).

**Interfaces:**
- Consumes: existing `activeType` (`useState<string|null>`), `scheduledTypes` (`ScheduleClient.tsx:104` in the sibling file pattern — here derived from `entry.workoutType.split(' or ')`), `availableTypes` (`useMemo`, `ScheduleClient.tsx:110`), `showAllRuns`, `isWorkout`, `setActiveType`.
- Produces: no new exported symbols. Behavior change only.

**Design notes (Approach A, from the spec):**
- **The committed type is the single source of truth.** The top orange "WORKOUT TYPE" commit card stays exactly as-is (it shows `activeType ?? entry.workoutType` and, when overridden, the "Scheduled: …" sub-line). Do **not** change the commit card's meaning.
- **Remove the second, duplicate type-pill row that renders in "Your run" mode** — the `availableTypes.length > 1` pill block currently inside the commit card (`ScheduleClient.tsx:455-471`). That block, when `!showAllRuns`, is the duplication the spec kills.
  - Keep the type-picker affordance available: the commit card must still let the leader *change* the week's type. Move the type-choice pills to render **only when the browse area is open** (`planTab === 'browse'`, i.e. after "Change workout"), OR keep them on the commit card but present them as the *single derived chip* per the spec. Per the spec's exact wording ("type appears only as a derived, removable chip defaulted to the committed week type"), render in the **browse area** (below the scope toggle, "Your run" only) a single chip:
    - Chip label: the effective committed type (`activeType ?? scheduledTypes[0]`), e.g. `Tempo ✕`.
    - Tapping the `✕` clears the type filter for browse → "show all types": set a new local `browseTypeCleared` boolean (see below) so the suggestion list widens to all library types, WITHOUT mutating `activeType` (the commit stays).
    - A "Clear — show all types" secondary affordance beside the chip when a type is active; when cleared, show a "Filter to {committedType}" affordance to restore.
- **Wire the chip's cleared state into the suggestion list.** `allSuggestions` (`ScheduleClient.tsx:173-187`) builds `weekTypes = activeType ? [activeType] : entry.workoutType.split(' or ')`. Add: when `browseTypeCleared` is true and `!showAllRuns`, pass `weekTypes: []` AND set a flag so `schedulePickerSuggestions` returns the whole library. **`schedulePickerSuggestions` currently filters `ownVariants` by `weekTypes.includes(w.type)`** (`lib/schedulePicker.ts`), so `weekTypes: []` yields an empty list — wrong. Extend the helper in this task:
  - Change the "Your run" workout branch of `schedulePickerSuggestions` to: `a.weekTypes.length === 0 ? a.ownVariants : a.ownVariants.filter(w => a.weekTypes.includes(w.type))`. Add a unit test for this (see Step 1).
- **Non-workout runs:** the commit card already gates on `isWorkout` (`ScheduleClient.tsx:443`), so no type shows. The browse chip must also gate on `isWorkout && !showAllRuns` — a non-workout run shows no chip and no error. Verified in Task 6.
- **"All runs" mode is unchanged:** the existing category/type browse pills (`ScheduleClient.tsx:582-597`) remain; no committed type to derive from there.

- [ ] **Step 1: Write the failing test — empty `weekTypes` means "all library types" (append to `__tests__/schedulePicker.test.ts`)**

```ts
describe('schedulePickerSuggestions — cleared type chip widens to all library types (#241)', () => {
  const base = {
    showAllRuns: false,
    ownVariants,
    allVariants,
    isWorkout: true,
    runCategory: 'Quality' as string | null,
    browseCategory: null,
    browseType: null,
    plannedId: null,
  }
  test('empty weekTypes offers the whole "Your run" library, not an empty list', () => {
    const out = schedulePickerSuggestions({ ...base, weekTypes: [] })
    expect(out.map(w => w.id).sort()).toEqual([1, 2]) // both TigerWolves library workouts
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/schedulePicker.test.ts`
Expected: FAIL — current helper filters by `weekTypes.includes(...)`, so `[]` returns `[]`.

- [ ] **Step 3: Extend `schedulePickerSuggestions` in `lib/schedulePicker.ts`**

Replace the "Your run" workout branch:

```ts
    : a.isWorkout
      ? a.weekTypes.length === 0
        ? a.ownVariants
        : a.ownVariants.filter(w => a.weekTypes.includes(w.type))
      : a.ownVariants.filter(w => !a.runCategory || w.category === a.runCategory)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/schedulePicker.test.ts`
Expected: PASS (new test + all existing schedulePicker tests still green — the non-empty path is unchanged).

- [ ] **Step 5: Commit the helper change**

```bash
git add lib/schedulePicker.ts __tests__/schedulePicker.test.ts
git commit -m "feat(#241): schedulePickerSuggestions widens to full library on cleared type"
```

- [ ] **Step 6: Add the browse type-chip state and remove the duplicate pill row (render change)**

In `components/ScheduleClient.tsx`:
1. Add state near the other browse state: `const [browseTypeCleared, setBrowseTypeCleared] = useState(false)`.
2. In `allSuggestions` (`ScheduleClient.tsx:173-187`), change the `weekTypes` line so a cleared chip in "Your run" workout mode passes `[]`:

```tsx
    const weekTypes = showAllRuns
      ? []
      : browseTypeCleared
        ? []
        : activeType ? [activeType] : entry.workoutType.split(' or ').map(t => t.trim())
```

   (In "All runs" mode `weekTypes` is ignored by the helper; passing `[]` is harmless. Confirm against `schedulePickerSuggestions` — the `showAllRuns` branch never reads `weekTypes`.)
   Add `browseTypeCleared` to the `useMemo` dependency array.
3. **Delete** the `!showAllRuns && availableTypes.length > 1` pill block at `ScheduleClient.tsx:455-471` (the duplicate row).
4. In the browse area, immediately after the `Your run / All runs` scope-toggle row (`ScheduleClient.tsx:546-560`) and only when `!showAllRuns && isWorkout`, render the derived chip:

```tsx
{!showAllRuns && isWorkout && (
  <div className="flex items-center gap-2 px-1 mb-2 text-xs">
    {browseTypeCleared ? (
      <button
        type="button"
        onClick={() => setBrowseTypeCleared(false)}
        className="font-semibold px-3 py-1 rounded-full bg-white border border-gray-200 text-gray-600 touch-manipulation"
      >Filter to {activeType ?? entry.workoutType} type</button>
    ) : (
      <>
        <span className="font-semibold px-3 py-1 rounded-full bg-orange-500 text-white inline-flex items-center gap-1">
          {activeType ?? entry.workoutType}
          <button
            type="button"
            aria-label="Clear type filter — show all types"
            onClick={() => setBrowseTypeCleared(true)}
            className="touch-manipulation leading-none"
          >✕</button>
        </span>
        <span className="text-gray-400">Clear — show all types</span>
      </>
    )}
  </div>
)}
```

5. **Preserve the ability to change the committed type.** Since the pill row is removed from the commit card, the leader still needs to *set* the week's type. Keep a type-choice control on the commit card, but only when there's a real choice AND it's the committed control (not the browse filter): render the `availableTypes` pills on the commit card as before but ALSO in "Your run" — the difference from today is only that the *browse* duplicate is gone. If, after building, the commit-card pills + browse chip read as redundant in Preview, the chip wins for browse and the commit-card pills stay for the commit (they set `activeType`, the chip only filters browse). Leave both wired; Lou arbitrates the visual in Task 6.
6. Reset `browseTypeCleared` to `false` whenever the week changes or the committed `activeType` changes, so a cleared browse filter doesn't silently persist across weeks. Add to the existing week/type reset effect (search for where `activeType`/`weekIndex` reset happens near `ScheduleClient.tsx:273`).

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (no type errors introduced).

- [ ] **Step 8: Commit the render change**

```bash
git add components/ScheduleClient.tsx
git commit -m "feat(#241): Schedule browse type becomes a derived removable chip (Approach A)"
```

---

### Task 5: Wire rating filter + "Top rated" sort into ScheduleClient

**Files:**
- Modify: `components/ScheduleClient.tsx` — add `ratingThreshold` + `sortBy` state, apply filter to `pickerSource`/`allSuggestions`, apply `rankByRating` when sorting, render `RatingFilter` on the scope-toggle row and a `Least recent | Top rated` sort toggle.
- Test: none new (logic covered in Tasks 1–2; wiring verified in Task 6).

**Interfaces:**
- Consumes: `RatingFilter`, `RATING_FILTER_OPTIONS` from `@/components/RatingFilter`; `passesRatingThreshold`, `rankByRating`, `RatingThreshold` from `@/lib/rating`; existing `voteData`, `workoutVoteId`.
- Produces: no new exports.

**Design notes:**
- New state: `const [ratingThreshold, setRatingThreshold] = useState<RatingThreshold>('any')` and `const [sortBy, setSortBy] = useState<'recent' | 'rating'>('recent')`.
- The picker list is computed twice (default `allSuggestions` and search `pickerSource`, `ScheduleClient.tsx:173-207`). Apply the rating filter and sort to **both** final lists via a single derived `useMemo` that wraps the currently-displayed source. Simplest: compute `const rankedSource = useMemo(() => { const filtered = (pickerSearch ? pickerSource : allSuggestions).filter(w => passesRatingThreshold(voteData[workoutVoteId(w.name, w.label ?? '')], ratingThreshold)); return sortBy === 'rating' ? rankByRating(filtered, voteData) : filtered }, [pickerSearch, pickerSource, allSuggestions, ratingThreshold, sortBy, voteData])` and feed `rankedSource` into `displayRows` (`ScheduleClient.tsx:209`) in place of the raw source.
- The rating filter ANDs with the type chip / All-runs pills (they already shaped `allSuggestions`/`pickerSource`) — do not bypass them.
- Render `RatingFilter` right-aligned on the existing scope-toggle row (`ScheduleClient.tsx:546-560`): add `<RatingFilter value={ratingThreshold} onChange={setRatingThreshold} className="ml-auto" />` inside that flex row (make the row `flex items-center` if not already).
- Render the sort toggle below the search box (or below the type chip), a two-button pill group `Least recent | Top rated` toggling `sortBy`, styled like the existing scope toggle. `Least recent` = `'recent'`, `Top rated` = `'rating'`.

- [ ] **Step 1: Add imports and state**

Add to imports: `import RatingFilter from '@/components/RatingFilter'` and `import { passesRatingThreshold, rankByRating } from '@/lib/rating'` and `import type { RatingThreshold } from '@/lib/rating'`. Add the two `useState` lines.

- [ ] **Step 2: Add the `rankedSource` `useMemo` and feed it into `displayRows`**

Insert the `rankedSource` memo after `pickerSource` (`ScheduleClient.tsx:207`) and change `displayRows` to iterate `rankedSource` instead of the previous source.

- [ ] **Step 3: Render `RatingFilter` on the scope-toggle row and the sort toggle**

Add the `<RatingFilter .../>` to the scope-toggle flex row and a `Least recent | Top rated` toggle beneath the search box.

- [ ] **Step 4: Type-check and run the full unit suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS (no type errors; all existing + new helper tests green).

- [ ] **Step 5: Commit**

```bash
git add components/ScheduleClient.tsx
git commit -m "feat(#241): rating filter + Top rated sort on Schedule browse"
```

---

### Task 6: Wire rating filter + "Top rated" sort into LibraryClient

**Files:**
- Modify: `components/LibraryClient.tsx` — add `ratingThreshold` + `sortBy` state, apply filter to the `filtered` list (`LibraryClient.tsx:116-121`), apply `rankByRating`, render `RatingFilter` next to the scope toggle (`LibraryClient.tsx:269-281`) and a `Top rated` sort option.
- Test: none new.

**Interfaces:**
- Consumes: `RatingFilter` from `@/components/RatingFilter`; `passesRatingThreshold`, `rankByRating`, `RatingThreshold` from `@/lib/rating`; existing `voteData`, `workoutVoteId`.
- Produces: no new exports.

**Design notes:**
- New state: `const [ratingThreshold, setRatingThreshold] = useState<RatingThreshold>('any')` and `const [sortBy, setSortBy] = useState<'recent' | 'rating'>('recent')`.
- `filtered` (`LibraryClient.tsx:116-121`) already ANDs category/type/race/search then sorts by `lastRan`. Add a `.filter(w => passesRatingThreshold(voteData[workoutVoteId(w.name, w.label ?? '')], ratingThreshold))` into that chain, and replace the trailing `.sort(...)` with a conditional: keep the least-recent sort for `sortBy === 'recent'`, apply `rankByRating(list, voteData)` for `sortBy === 'rating'`. Because `filtered` feeds the family grouping downstream, compute the sort on the flat variant list *before* grouping (rating sort orders the flat list; the existing grouping consumes that order).
- **Family-grouped view caveat:** the Library groups variants into families (`LibraryClient.tsx:123+`). "Top rated" ranks the flat variant list; the family that owns the highest-ranked surviving variant should surface first. Keep it simple: sort the flat `filtered` list with `rankByRating`, then let the existing first-seen family grouping preserve that order (the grouping is order-preserving by first appearance). Verify in-Preview that the highest-rated family floats up.
- Render `RatingFilter` on the `Your run / All runs` toggle row (`LibraryClient.tsx:269-281`): make that row `flex items-center` and add `<RatingFilter value={ratingThreshold} onChange={setRatingThreshold} className="ml-auto" />`. If `runId` is falsy (toggle hidden), still render the RatingFilter in its own row so Library-without-scope still filters by rating.
- Add a `Least recent | Top rated` sort toggle near the filters (e.g. below the type-filter row, `LibraryClient.tsx:313-321`), styled like the existing pills.

- [ ] **Step 1: Add imports and state**

Add `import RatingFilter from '@/components/RatingFilter'`, `import { passesRatingThreshold, rankByRating } from '@/lib/rating'`, `import type { RatingThreshold } from '@/lib/rating'`, and the two `useState` lines.

- [ ] **Step 2: Apply the rating filter + conditional sort to `filtered`**

Modify the `filtered` chain (`LibraryClient.tsx:116-121`) to add the `passesRatingThreshold` filter and the `sortBy`-conditional sort (`rankByRating` when `'rating'`).

- [ ] **Step 3: Render `RatingFilter` and the sort toggle**

Add `<RatingFilter .../>` to the scope-toggle row and a `Least recent | Top rated` toggle.

- [ ] **Step 4: Type-check and run the full unit suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/LibraryClient.tsx
git commit -m "feat(#241): rating filter + Top rated sort on Library"
```

- [ ] **Step 6: Manual Preview verification (all render-only ACs)**

On the PR's Vercel Preview URL, signed in as the test leader (`.env.local` `PLAYWRIGHT_TEST_EMAIL`/`PASSWORD`), confirm — because no jsdom unit tests cover render:
- **AC1:** Schedule browse — the RatingFilter sits on the scope-toggle row; picking `😃 & up` narrows the list to variants with avg ≥ 4 (and hides zero-vote cards).
- **AC2:** Schedule `Top rated` reorders; a 1-vote 🥳 card does **not** outrank a many-vote 😃 card.
- **AC3:** In "Your run" mode there is exactly one type source — the committed card at top — and the browse area shows the single derived removable chip defaulting to the week type; tapping `✕` widens to all library types; "All runs" still shows its category/type pills.
- **AC4:** Library RatingFilter (next to scope toggle) and `Top rated` behave identically.
- **AC6:** Open a **non-workout** run's Schedule (e.g. an Easy/Long run) — no type control anywhere, no console error, browse shows scope + rating + search + sort.
- Update the PR's "Manual steps (Lou)" checklist with any items only Lou can judge (visual arbitration of commit-card pills vs. browse chip from Task 4 Step 5).

---

### Task 7: Docs — update the wiki Architecture Overview picker section

**Files:**
- Modify: wiki page `Architecture-Overview` (pushed separately via SSH to `git@github.com:foulox/tigerwolves.wiki.git`, `master` — wikis have no PR).

**Design notes:**
- Add a short note under the picker/schedule section: the Schedule browse and Library share `lib/rating.ts` (`passesRatingThreshold` filter, `rankByRating` Bayesian sort with `m=5`) and the `RatingFilter` dropdown; Schedule type is committed once (top card) and appears in "Your run" browse only as a derived removable chip; the picker's primary browse axis is axis-aware (type for workout runs, none for non-workout runs — distance is a sibling story).
- This is a wiki edit, not part of the code PR; do it in the same session per the "update the wiki in the same PR/session" rule. No commit in the code repo for this task.

- [ ] **Step 1:** Clone/update the wiki, edit `Architecture-Overview.md`, push to `master`. (No repo commit.)

---

## Notes for the executor

- **No schema migration** — skip all Neon-branch migration steps; this story touches only KV-read `voteData` (already fetched) and client render.
- **First commit on this branch is this plan file** (project convention) — already committed before Task 1.
- After all tasks: run `npx tsc --noEmit && npx vitest run` once more, then open the PR with the AC list, a **Test plan (Claude)** section (tsc, `vitest run`, greps) and a **Manual steps (Lou)** section (the Task 6 Step 6 Preview checks). Tell Lou the PR touches multiple files and to run `/review` before merging.
