# Story 1B — Schedule picker → Model C (+ NBR reskin) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the Schedule "Change workout" picker to the Model C surface — reusing the shared `SortControl` / `FiltersButton` / `FilterSheet` primitives built in Story 1A — and reskin the picker to the NBR square-cornered token system in the same story, so there is no mixed-skin seam.

**Architecture:** Two interleaved changes to `components/ScheduleClient.tsx`. (1) **Reskin:** replace the pre-NBR styling (`rounded-full` / `rounded-2xl` / `rounded-xl` / `bg-accent` / `shadow-sm`) with NBR tokens (square corners, `bg-card`/`border-line`/`text-ink`/`text-muted`, `bg-ink` for primary actions, cyan `text-link` for links). (2) **Model C:** the browse filter controls (scope toggle, type-clear chip, sort toggle, All-runs category/type pills, rating) move off the page and into the shared `FilterSheet`, behind a `FiltersButton` that summarizes the active filters; search + `SortControl` sit on a slim top bar. The **"WORKOUT TYPE" commit box stays at the top** (it sets the week's type for the post — not a filter), the **"Currently planned" card**, the **Post/Browse tabs**, the **post editor**, and the **All-runs borrow semantics** are unchanged in behavior (reskinned only). The button's active-filter summary comes from a new pure, unit-tested `lib/scheduleFilters.ts`, mirroring `lib/libraryFilters.ts`.

**Tech Stack:** Next.js App Router, React client components, Tailwind v4 (NBR tokens in `lib/cardStyles.ts`), vitest (node-env) for pure helpers, Playwright for e2e.

**Spec:** `docs/superpowers/specs/2026-10-18-axis-aware-picker-redesign-design.md`

## Global Constraints

- **Depends on Story 1A** (#530): `SortControl`, `FiltersButton`, `FilterSheet` (`components/`) and the `RATING_SUMMARY` pattern must already exist. Build 1B on top of 1A's merged branch.
- **No schema migration** — UI/logic only.
- **No behaviour change** to: which workouts the picker offers (the `schedulePicker.ts` pipeline + `pickerSource`/`rankedSource` are untouched), the week-type commit, the "Currently planned" card, the Post/Browse tabs, the All-runs borrow ("Schedule for this week" vs "+ Add to my run"), the post editor/verify/copy flow, or the two sort options (`recent` / `rating`).
- **NBR tokens only** — square corners, Jost display, ink/muted/line, cyan = links only, `bg-ink` for primary buttons. Reuse `filterChip`, `SEARCH_FIELD`, `SEARCH_INPUT`, `SQUARE_LABEL`, `OUTLINE_BTN`, `CARD_NAME` from `lib/cardStyles.ts`. No `rounded-*`, no `shadow-sm`, no `bg-accent` left behind.
- **`touch-manipulation`** on every interactive element; **`aria-label`** on icon-only controls (week nav arrows already have them — keep).
- **Out of scope:** the distance slider / Distance sort (Story 4 / #461), the A–Z / direction / never-ran sort-model changes (Story 2), the Beginner-Friendly merge (Story 3).

## Review Focus

- **A long active-filter summary truncates on a ~320px phone** (e.g. "All runs · Quality · Hills · 😃 & up") without wrapping the top bar. (No DOM test — `FiltersButton` from 1A already sets `truncate`/`min-w-0`; verified on Preview in Task 5.)
- **Switching scope / week / type still resets the browse filters** (the existing `setScope`/`changeWeek`/`selectBrowseCategory` resets) so a stale filter can't silently empty the next view. (Pinned by Task 1 `scheduleFilterCount` reflecting reset state + Preview check.)
- **The week-type commit is NOT counted as having been changed when it's the scheduled default** — opening the sheet on a fresh Hills week shows the list narrowed to Hills, and the button reads `Filters · Hills` (honest about the narrowing), but clearing type to "all" drops it. (Pinned by Task 1 tests.)
- **All-runs mode shows the borrow explainer and the category/type pills inside the sheet**, and "+ Add to my run" / "Schedule for this week" still behave per #405. (Preview check, Task 5.)
- **The "Currently planned" card + Post/Browse tabs render only when a workout is planned**, unchanged by the reskin. (Covered by existing `schedule.spec.ts`; Task 4.)

---

### Task 1: Pure filter-summary model — `lib/scheduleFilters.ts`

**Files:**
- Create: `lib/scheduleFilters.ts`
- Test: `__tests__/scheduleFilters.test.ts`

**Interfaces:**
- Consumes: `RatingThreshold` (`lib/rating`).
- Produces:
  - `type ScheduleFilters = { showAllRuns: boolean; typeLabel: string | null; browseCategory: string | null; browseType: string | null; rating: RatingThreshold }`
  - `scheduleFilterCount(f: ScheduleFilters): number`
  - `scheduleFilterSummary(f: ScheduleFilters): string`

`typeLabel` is the *effective browse type* in Your-run workout mode (the committed week type, or `null` when the leader has cleared to all types, or `null` for non-workout runs). In All-runs mode `typeLabel` is `null` and `browseCategory`/`browseType` carry the narrowing. The component computes `typeLabel`; this module only summarizes.

- [ ] **Step 1: Write the failing test**

Create `__tests__/scheduleFilters.test.ts`:

```ts
import { describe, test, expect } from 'vitest'
import { scheduleFilterCount, scheduleFilterSummary, type ScheduleFilters } from '../lib/scheduleFilters'

const EMPTY: ScheduleFilters = { showAllRuns: false, typeLabel: null, browseCategory: null, browseType: null, rating: 'any' }

describe('scheduleFilterCount / scheduleFilterSummary', () => {
  test('a fresh Your-run Hills week: type shown, nothing else', () => {
    const f: ScheduleFilters = { ...EMPTY, typeLabel: 'Hills' }
    expect(scheduleFilterCount(f)).toBe(1)
    expect(scheduleFilterSummary(f)).toBe('Hills')
  })

  test('cleared to all types: no narrowing', () => {
    expect(scheduleFilterCount(EMPTY)).toBe(0)
    expect(scheduleFilterSummary(EMPTY)).toBe('')
  })

  test('Your-run Hills + a rating threshold', () => {
    const f: ScheduleFilters = { ...EMPTY, typeLabel: 'Hills', rating: 'good' }
    expect(scheduleFilterCount(f)).toBe(2)
    expect(scheduleFilterSummary(f)).toBe('Hills · 😃 & up')
  })

  test('All-runs with browse category + type: scope + both pills count; typeLabel ignored', () => {
    const f: ScheduleFilters = { showAllRuns: true, typeLabel: null, browseCategory: 'Easy', browseType: 'Progressive', rating: 'any' }
    expect(scheduleFilterCount(f)).toBe(3)
    expect(scheduleFilterSummary(f)).toBe('All runs · Easy · Progressive')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- scheduleFilters`
Expected: FAIL — `Cannot find module '../lib/scheduleFilters'`.

- [ ] **Step 3: Write the implementation**

Create `lib/scheduleFilters.ts`:

```ts
import type { RatingThreshold } from './rating'

// Story 1B: summarizes the Schedule picker's active browse filters for the Filters
// button. The filtering itself stays in lib/schedulePicker.ts; this is display-only.
// typeLabel = the effective browse type in Your-run workout mode (the committed week
// type, or null when cleared to all types / non-workout). In All-runs mode it's null
// and browseCategory/browseType carry the narrowing. Mirrors lib/libraryFilters.ts.
export type ScheduleFilters = {
  showAllRuns: boolean
  typeLabel: string | null
  browseCategory: string | null
  browseType: string | null
  rating: RatingThreshold
}

const RATING_SUMMARY: Record<Exclude<RatingThreshold, 'any'>, string> = {
  ok: '😐 & up', good: '😃 & up', love: '🥳 only',
}

function parts(f: ScheduleFilters): string[] {
  const p: string[] = []
  if (f.showAllRuns) {
    p.push('All runs')
    if (f.browseCategory) p.push(f.browseCategory)
    if (f.browseType) p.push(f.browseType)
  } else if (f.typeLabel) {
    p.push(f.typeLabel)
  }
  if (f.rating !== 'any') p.push(RATING_SUMMARY[f.rating])
  return p
}

export function scheduleFilterCount(f: ScheduleFilters): number {
  return parts(f).length
}

export function scheduleFilterSummary(f: ScheduleFilters): string {
  return parts(f).join(' · ')
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:unit -- scheduleFilters`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/scheduleFilters.ts __tests__/scheduleFilters.test.ts
git commit -m "feat(#NNN): pure Schedule filter-summary model for the Filters button"
```

---

### Task 2: Reskin the Schedule picker to NBR tokens

**Files:**
- Modify: `components/ScheduleClient.tsx` (presentation classes only — no logic/handlers change)

**Interfaces:** none produced; this task only swaps classes.

Apply this mapping everywhere it appears in the render tree. All replacements are presentation-only — do not touch any `onClick`, `useMemo`, state, or conditional.

| Current (pre-NBR) | NBR replacement |
|---|---|
| `rounded-full` pill `bg-accent text-white` (active) / `bg-card border border-line text-muted` (inactive) | `filterChip(isActive)` from `lib/cardStyles` |
| `rounded-2xl border border-line shadow-sm` card | `bg-card border border-line` (square, no shadow) |
| `rounded-xl` / `rounded-lg` on containers/buttons | drop the radius (square) |
| `bg-accent text-white` primary button (Set as plan / Schedule for this week / Copy) | `bg-ink text-white` |
| `text-accent` interactive hint ("tap to change", "✎ editable") | `text-link` |
| `ring-1 ring-accent` selected-card ring | `border-ink` (2px ink border via `border-2 border-ink`) |
| `bg-surface rounded-xl` tab bar | `border border-line` square tab bar; active tab `bg-ink text-white`, inactive `text-muted` |
| family "N versions" badge `rounded-full bg-surface border` | `SQUARE_LABEL` from `lib/cardStyles` |
| "WORKOUT TYPE" box `bg-surface border border-line rounded-2xl` + `text-accent` eyebrow + `text-2xl font-bold` | square `border border-line bg-surface`; eyebrow → `NEXT_UP_LABEL` style; title `CARD_NAME` sizing |
| week-nav container `rounded-2xl ... shadow-sm` + `rounded-xl` arrow buttons | square `border border-line`; arrow buttons keep size, drop radius |

- [ ] **Step 1: Reskin the week-nav + leader area (lines ~426-473)**

Square the container (`border border-line`, no `rounded-2xl`/`shadow-sm`), drop `rounded-xl` on the arrow buttons (keep their `aria-label`s and disabled logic). Change the "tap to change" hint from `text-accent` to `text-link`.

- [ ] **Step 2: Reskin the WORKOUT TYPE commit box + its type chips (lines ~477-507)**

Square box; eyebrow uses the `NEXT_UP_LABEL` treatment; the type chips (currently `rounded-full bg-accent`/`bg-card border`) become `filterChip(isActive)`. Behaviour (the `setActiveType` toggle, the `availableTypes.length > 1` gate) is unchanged.

- [ ] **Step 3: Reskin "Currently planned" card + Post/Browse tabs (lines ~509-570)**

Square the planned card (`bg-card border border-line`, selected → `border-2 border-ink`). The tab bar becomes a square `border border-line` row; active tab `bg-ink text-white`, inactive `text-muted` — drop `rounded-xl`/`rounded-lg`/`bg-surface`/`shadow-sm`.

- [ ] **Step 4: Reskin the result cards + "Show more" + primary action + post editor (lines ~681-844)**

Square all result cards (`bg-card border border-line`, selected → `border-2 border-ink` instead of `ring-1 ring-accent`); the family-versions badge → `SQUARE_LABEL`; the selection radio `border-accent bg-accent` → `border-ink bg-ink`; "Show N more", "Set as plan"/"Schedule for this week" (→ `bg-ink text-white`), the textarea focus ring and "✎ editable"/verify/Copy block all lose their radii and swap `accent`→`ink`/`link`.

- [ ] **Step 5: Verify compile, lint, and the reskin contract**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors; grep confirms none left behind:

```bash
rg -n "rounded-(full|xl|2xl|lg)|bg-accent|ring-accent|shadow-sm" components/ScheduleClient.tsx
```
Expected: no matches (or only ones you deliberately keep and can justify).

- [ ] **Step 6: Commit**

```bash
git add components/ScheduleClient.tsx
git commit -m "feat(#NNN): reskin Schedule picker to NBR square token system"
```

---

### Task 3: Wire the Schedule browse surface to Model C

**Files:**
- Modify: `components/ScheduleClient.tsx` (imports; add `sheetOpen` state; derive `ScheduleFilters`; replace the inline browse-control blocks with the top bar + `FiltersButton` + `FilterSheet`)

**Interfaces:**
- Consumes: `SortControl`, `FiltersButton`, `FilterSheet` (Story 1A); `scheduleFilterCount`, `scheduleFilterSummary`, `ScheduleFilters` (Task 1).

- [ ] **Step 1: Add imports and sheet state**

Add imports:

```tsx
import SortControl from '@/components/SortControl'
import FiltersButton from '@/components/FiltersButton'
import FilterSheet from '@/components/FilterSheet'
import { scheduleFilterCount, scheduleFilterSummary, type ScheduleFilters } from '@/lib/scheduleFilters'
import { SEARCH_FIELD, SEARCH_INPUT, filterChip } from '@/lib/cardStyles'
```

Add state beside the others (after line ~88):

```tsx
const [sheetOpen, setSheetOpen] = useState(false)
```

- [ ] **Step 2: Derive the filter summary**

After `rankedSource` (around line ~228), derive the summary object. `typeLabel` is the effective browse type in Your-run workout mode — the committed type unless cleared:

```tsx
const effectiveBrowseType = !showAllRuns && isWorkout && !browseTypeCleared
  ? (activeType ?? scheduledTypes[0] ?? null)
  : null
const scheduleFilters: ScheduleFilters = {
  showAllRuns,
  typeLabel: effectiveBrowseType,
  browseCategory,
  browseType,
  rating: ratingThreshold,
}
const filterCount = scheduleFilterCount(scheduleFilters)
const filterSummary = scheduleFilterSummary(scheduleFilters)
```

- [ ] **Step 3: Replace the inline browse controls with the Model C surface**

Inside the `{(!plannedWorkout || planTab === 'browse') && (...)}` block, replace the inline scope-toggle+rating row (lines ~577-591), the type-clear chip (lines ~593-616), the All-runs explainer (lines ~618-622), the search field (lines ~624-633), the sort toggle (lines ~636-645), and the All-runs category/type pills (lines ~649-664) with:

```tsx
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
    value={sortBy}
    options={[{ value: 'recent', label: 'Least recent' }, { value: 'rating', label: 'Top rated' }]}
    onChange={setSortBy}
  />
</div>

<div className="mb-3">
  <FiltersButton count={filterCount} summary={filterSummary} onOpen={() => setSheetOpen(true)} />
</div>

<FilterSheet
  open={sheetOpen}
  onClose={() => setSheetOpen(false)}
  onClear={() => setScope(showAllRuns)}  // setScope already resets type/rating/browse pills for the active scope
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

  {/* Your-run workout: Type facet, defaulting to the week's committed type, clearable to all */}
  {!showAllRuns && isWorkout && availableTypes.length > 1 && (
    <div>
      <p className="font-display uppercase tracking-[0.18em] text-[9px] font-semibold text-muted mb-2">Type</p>
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setBrowseTypeCleared(true)}
          className={filterChip(browseTypeCleared)}
        >All types</button>
        <button
          onClick={() => setBrowseTypeCleared(false)}
          className={filterChip(!browseTypeCleared)}
        >{activeType ?? entry.workoutType} (this week)</button>
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

  <div>
    <p className="font-display uppercase tracking-[0.18em] text-[9px] font-semibold text-muted mb-2">Rating</p>
    <RatingFilter value={ratingThreshold} onChange={setRatingThreshold} />
  </div>

  {showAllRuns && (
    <p className="text-xs text-muted leading-snug">
      Browsing every run&rsquo;s workouts. <span className="font-semibold text-ink">Schedule for this week</span> borrows one for this week only; <span className="font-semibold text-link">+ Add to my run</span> adopts it permanently.
    </p>
  )}
</FilterSheet>
```

Leave the list rendering, "Show more", the empty-state messages, the primary action button, and the post editor below exactly as reskinned in Task 2.

- [ ] **Step 4: Verify compile and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors; no unused leftovers (the old inline-control JSX is gone; `browseTypeCleared`/`setBrowseTypeCleared` are still used by the sheet Type facet).

- [ ] **Step 5: Commit**

```bash
git add components/ScheduleClient.tsx
git commit -m "feat(#NNN): Schedule browse adopts Model C (shared sheet + Filters button + sort)"
```

---

### Task 4: Update e2e to the Model C interaction

**Files:**
- Modify: `e2e/schedule.spec.ts` (the All-runs borrow test opens the sheet before toggling scope / browse pills)

**Interfaces:** consumes the Model C DOM from Task 3.

- [ ] **Step 1: Wrap scope/browse interactions with the sheet**

Add an `openFilters` helper (same as 1A) at the top of `e2e/schedule.spec.ts`, then update the All-runs borrow test (~lines 125-138): before `getByRole('button', { name: 'All runs' }).click()`, call `await openFilters(page)`; after selecting scope/pills, `await page.getByRole('button', { name: 'Show results', exact: true }).click()`. The search field is still on the top bar — search interactions are unchanged. The selection → "Schedule for this week" → save assertions are unchanged.

```ts
async function openFilters(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Filters', exact: false }).first().click()
  await expect(page.getByRole('dialog', { name: 'Filters' })).toBeVisible()
}
```

- [ ] **Step 2: Check for a Schedule reskin/browse contract spec**

Run: `rg -ln "schedule|Change workout|Set as plan|Currently planned" e2e`
For any spec that asserts the Schedule picker's scope/sort/type controls by role/text, update it to the sheet + dropdown interaction the same way (sort chips → `getByRole('button', { name: 'Change sort order' })` then `getByRole('menuitem', ...)`; scope/type → open the sheet first). Behaviour assertions (workout names, "Currently planned", tabs) stay.

- [ ] **Step 3: Run the affected e2e specs**

Run: `npm run test:e2e -- schedule`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e/schedule.spec.ts
git commit -m "test(#NNN): e2e drives Schedule filters via the Model C sheet + sort dropdown"
```

---

### Task 5: Preview verification + accessibility sweep

**Files:** none. Push the branch for a Vercel Preview.

- [ ] **Step 1: Full local gate**

Run: `npx tsc --noEmit && npm run lint && npm run test:unit && npm run test:e2e -- schedule`
Expected: all green.

- [ ] **Step 2: Verify on the Preview URL (signed-in test leader)**

On the Schedule page's "Change workout" tab, confirm:
- The whole picker is **square / NBR-skinned** — no rounded cards or chips remain (visually matches the Library page's chrome).
- The **WORKOUT TYPE** commit box stays at the top; changing it still drives the post and the default browse type.
- The **Filters sheet is the same component as Library's** — identical frame, button, and sort dropdown; only the facets differ.
- A fresh Hills week: list starts narrowed to Hills, button reads **Filters · Hills**; opening the sheet and choosing **All types** widens the list and the button drops to **Filters**.
- **All runs**: the borrow explainer + category/type pills appear in the sheet; "Schedule for this week" (borrow) and "+ Add to my run" (adopt) behave per #405.
- The **Currently planned** card + **Post/Browse** tabs appear only when a workout is planned; the post editor/verify/copy flow is unchanged.
- A long summary truncates on a ≤360px viewport; opening/closing the sheet preserves search text and sort.

- [ ] **Step 3: Accessibility check**

Sort trigger labelled "Change sort order"; sheet is a labelled dialog; every pill/button has `touch-manipulation`; the Filters button exposes its active count via `aria-label`; week-nav arrows keep their labels.

- [ ] **Step 4: Wiki + PR**

- Update the **Architecture Overview** wiki page's Schedule-picker section to the Model C surface + NBR skin.
- Open the PR with **Test plan (Claude)** and **Manual steps (Lou)** sections and the full AC list. Tell Lou the file count and that `/review` should run before merge.

---

## Self-Review

**Spec coverage:** Implements the spec's "applied to both Library and Schedule" (the Schedule half), "filter unification" (race-type/rating present via the shared sheet), and the Model C surface, plus the reskin Lou folded in. Distance slider, sort-model changes, and the kind merge are out of scope (Stories 4/2/3) and noted in Global Constraints. The week-type commit, borrow mode, Currently-planned card, tabs, and post flow are explicitly preserved.

**Placeholder scan:** `#NNN` (the Story 1B issue number, assigned at PUBLISH) is the one intentional placeholder. The reskin task uses a mapping table + per-block instructions rather than reproducing all ~850 lines — the mapping is the real content, applied systematically, with a grep gate (Task 2 Step 5) proving no pre-NBR class survives. No TODOs.

**Type consistency:** `ScheduleFilters` fields match between Task 1 and Task 3's derivation. `SortControl`'s `value/options/onChange` match the `sortBy: 'recent' | 'rating'` usage (identical to 1A). `scheduleFilterCount`/`scheduleFilterSummary` signatures match their call sites.

**Review Focus:** truncation and sheet-preserves-search are no-DOM Preview checks (Task 5); summary-reflects-narrowing and reset-on-scope are pinned by Task 1 tests; All-runs borrow and the Currently-planned/tabs gating are Preview + existing-spec checks (Tasks 4-5). Section complete.
