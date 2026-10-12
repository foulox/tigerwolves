# NBR v2 Story 4 — Browse screens (Library + Races) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin the browse screens' own pieces — the search field, filter chips, author lines, abbrev/add affordances on **Library**, and the race card, countdown, verified state, priority chips, and "Add a race" on **Races** — to NBR's monochrome/square/Jost-label brand, without changing any behavior.

**Architecture:** A reskin only — no data, routing, or handler changes. The browse-specific chip/search/button styling is added to the existing Story-2 single-source `lib/cardStyles.ts` (string constants + one `filterChip(active)` helper) so Library and Races can't drift from each other, then `LibraryClient.tsx` and `RacesClient.tsx` swap their `rounded-*` / colored Tailwind classes for the square/monochrome ones. Uppercasing is done with the CSS `uppercase` class — the JSX text content never changes — so every `getByText` / `getByRole({name})` in the e2e suite stays green. Visual attributes are Preview-checked, never asserted as classes (epic #510 Testing rule); the interactive contract is locked by an e2e characterization spec written **before** the reskin.

**Tech Stack:** Next.js (App Router), React client components, Tailwind v4 tokens (`app/globals.css`), lucide-react icons, Clerk, Playwright e2e, Vitest.

**Spec:** `docs/superpowers/plans/2026-10-11-nbr-redesign-spec.md` (epic #510, Story 4) + issue #514. Design system: `docs/superpowers/plans/2026-10-11-nbr-design-system.md`. Visual target: `docs/superpowers/plans/2026-10-11-nbr-prototype.html` (`#library` and `#races` sections; `.k-chip`, `.k-btn`, `.k-lchip`, `.k-search`, `.k-label`, `.k-type` CSS). Shared reskin tokens from Story 2: `lib/cardStyles.ts`.

## Global Constraints

- **Monochrome only — there is no red/green/yellow in NBR's brand.** Replace every `bg-red-*`/`text-red-*`/`bg-green-*`/`text-green-*`/`bg-yellow-*` used for *brand/status decoration* with ink/white/muted/line tokens. (Form-validation error text `text-red-600` is a functional usability signal, not decoration — leave it; flag for Preview.)
- **Cyan (`text-link`) is links only** — never a decorative accent. Don't introduce it here unless an element is a true navigational link.
- **Square corners.** Remove every `rounded-full` / `rounded-xl` / `rounded-2xl` / `rounded-lg` on browse elements. The brand radius is `0`.
- **Labels are `font-display` (Jost) 500, UPPERCASE, letter-spaced, via the CSS `uppercase` class — never by changing the literal JSX text.** Changing visible text would break e2e selectors.
- **Reskin only — zero behavior change.** Every `onClick`, `href`, `data-testid`, `data-tour`, `aria-label`, `title`, form submit, and state handler stays byte-identical. Only `className` strings (and the search field's wrapper structure) change.
- **`touch-manipulation` stays on every interactive element** (project rule); icon-only buttons keep their `aria-label`.
- **`--color-accent` is deprecated** (now `#1f1f1f` ink, removed in the final story) — use `bg-ink`/`text-ink`/`border-ink` directly, not `bg-accent`, in anything you touch.
- `npm run test:unit` + `npx tsc --noEmit` green; e2e green (`e2e/library.spec.ts`, `e2e/races.spec.ts`, `e2e/browse-reskin-contract.spec.ts`); Preview is the visual check (Lou tests via CI + Preview, never local dev).

## Review Focus

- **Search that silently stops filtering** — a reskin that restructures the search `<input>` wrapper could drop the `value`/`onChange`/`type="search"` binding, leaving a box that types but doesn't filter. `tsc` + Preview won't catch it. → pinned in Task 1 (search characterization: typing a query hides non-matches, clearing restores them).
- **A filter chip whose `onClick` is lost in the class swap** (category / race-type / Your-run↔All-runs / sort) — the list would stop narrowing with no visible error. → sort toggle pinned in Task 1 (count-label flip); category/scope already covered by `library.spec.ts` (kept green through Task 3); race-type/type chips are the identical `filterChip`+`onClick` swap.
- **"Add a race" that opens no sheet, or submits nothing** — the button is restyled from filled-pill to outline; a dropped `onClick`/submit means races can't be added. → pinned in Task 1 (open the sheet, fill, submit, assert the new card appears).
- **A priority (Target/Tune-Up/Fun) chip that no longer tags** — restyled from pill+ring to square+ink; a lost `handleTag` means the tally never moves. → pinned in Task 1 (tag the self-added race, assert the count reflects it).
- **Leader "Mark as verified" that no longer verifies** — restyled from green to ink outline; a dropped `submitVerify` leaves races stuck Unverified. → pinned in Task 1 (verify the self-added race, assert Unverified→Verified); "Flag an issue" sheet-open also pinned there.

---

### Task 1: Characterization lock — browse interactive contract (BEFORE any reskin)

Written first, passing against the **current** screens, and kept green through Tasks 3–4. Covers the behavioral gaps the existing specs don't: Library **search** + **race-type filter**, and the Races **add / tag / verify / flag** affordances. Mirrors the Story-2 pattern in `e2e/card-reskin-contract.spec.ts`.

**Fixture-safety (serial, `workers:1`, alphabetical file order → this file runs before `library`/`races`):** the Races half operates entirely on a **self-added race** with a unique name (`Reskin Contract Marathon`). Adding a race touches only the `races` table (never workouts, so Library's "17 workouts" count is unaffected); the two seeded fixture races are never mutated, so `races.spec.ts` stays valid. Tag/verify/flag act on the self-added row only.

**Files:**
- Create: `e2e/browse-reskin-contract.spec.ts`

**Interfaces:**
- Consumes: the live `/library` and `/races` screens as they exist on `main` (pre-reskin).
- Produces: a green behavioral baseline that Tasks 3 and 4 must not break.

- [ ] **Step 1: Write the characterization spec**

```ts
import { test, expect, type Page } from '@playwright/test'

// Browse interactive contract — locked BEFORE the NBR Story-4 reskin (#514) and
// kept green through it. Presentation changes (square corners, monochrome, Jost
// labels); every behavior below must survive unchanged. BEHAVIOR ONLY — roles,
// text, handlers, navigation — never visual classes (epic #510 Testing rule).
//
// Auth: default storageState is the TigerWolves test-leader (playwright.config.ts),
// so leader-only affordances (Mark as verified) are present.
//
// Fixture safety: workers:1 + fullyParallel:false run specs serially in file order;
// this file (b…) runs before library (l…) and races (r…). The Races half mutates
// ONLY a self-added race (unique name) — never the two seeded fixtures — so those
// specs' assertions stay valid. Adding a race never touches the workouts table.

const NEW_RACE = 'Reskin Contract Marathon'

test.describe('Library browse contract (#514)', () => {
  test('search filters the list; clearing restores it', async ({ page }) => {
    await page.goto('/library')
    await page.waitForLoadState('load')

    // A seeded TigerWolves workout whose name never collides with a type pill.
    const target = page.getByText('The Moneghetti')
    const other = page.getByText('Ladder - 1 to 5 to 1')
    await expect(target).toBeVisible()
    await expect(other).toBeVisible()

    const search = page.locator('input[type="search"]')
    await search.fill('Moneghetti')
    await expect(target).toBeVisible()       // match stays
    await expect(other).toHaveCount(0)       // non-match filtered out

    await search.fill('')                    // clear restores the full list
    await expect(page.getByText('Ladder - 1 to 5 to 1')).toBeVisible()
  })

  test('sort toggle switches the ordering label', async ({ page }) => {
    await page.goto('/library')
    await page.waitForLoadState('load')

    // The sort chips ("Least recent" / "Top rated") are restyled filter chips; the
    // count line echoes the active sort, so the label is a reliable behavioral proof
    // that the chip's onClick survived the reskin. (Race-type/type chips are the same
    // filterChip + onClick swap as the category chips, which library.spec.ts locks;
    // seeded workouts carry no race tags, so a race-type filter can't be asserted here.)
    await expect(page.getByText(/workouts · oldest first/)).toBeVisible()
    await page.getByRole('button', { name: 'Top rated', exact: true }).click()
    await expect(page.getByText(/workouts · top rated/)).toBeVisible()
    await page.getByRole('button', { name: 'Least recent', exact: true }).click()
    await expect(page.getByText(/workouts · oldest first/)).toBeVisible()
  })
})

test.describe('Races browse contract (#514)', () => {
  async function addRace(page: Page) {
    await page.goto('/races')
    await page.waitForLoadState('load')
    await page.getByRole('button', { name: 'Add a race' }).click()
    await expect(page.getByRole('heading', { name: 'Add a race' })).toBeVisible()
    await page.getByPlaceholder('e.g. NYC Marathon').fill(NEW_RACE)
    // Date input: 60 days out (any valid future date; format YYYY-MM-DD).
    await page.locator('input[type="date"]').first().fill('2027-01-01')
    await page.getByRole('button', { name: 'Add race', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Add a race' })).not.toBeVisible()
  }

  test('Add a race: opens the sheet, submits, the new card appears', async ({ page }) => {
    await addRace(page)
    const card = page.locator(`[data-testid="race-card-${NEW_RACE}"]`)
    await expect(card).toBeVisible()
    await expect(card.getByText('Unverified')).toBeVisible()
  })

  test('priority tag: tagging Target reflects in the tally', async ({ page }) => {
    const card = page.locator(`[data-testid="race-card-${NEW_RACE}"]`)
    await page.goto('/races')
    await page.waitForLoadState('load')
    // (Race persists from the previous test in this serial file.) Tag Target.
    const targetChip = card.getByRole('button', { name: /Target/ })
    await expect(targetChip).toBeVisible()
    await targetChip.click()
    await expect(card.getByRole('button', { name: /Target · 1/ })).toBeVisible()
  })

  test('leader Mark as verified flips Unverified → Verified', async ({ page }) => {
    const card = page.locator(`[data-testid="race-card-${NEW_RACE}"]`)
    await page.goto('/races')
    await page.waitForLoadState('load')
    await expect(card.getByText('Unverified')).toBeVisible()
    await card.getByRole('button', { name: 'Mark as verified' }).click()
    await expect(card.getByText('Verified', { exact: true })).toBeVisible()
  })

  test('Flag an issue opens the flag sheet', async ({ page }) => {
    const card = page.locator(`[data-testid="race-card-${NEW_RACE}"]`)
    await page.goto('/races')
    await page.waitForLoadState('load')
    await card.getByRole('button', { name: 'Flag an issue' }).click()
    await expect(page.getByRole('heading', { name: 'Flag an issue' })).toBeVisible()
  })
})
```

- [ ] **Step 2: Run it against the current app to verify it PASSES now** (the pre-reskin screens render every control these assert).

Run: `npx playwright test e2e/browse-reskin-contract.spec.ts`
Expected: PASS (7 tests). If a selector needs adjusting to the *current* markup, fix the selector — not by relaxing the assertion — until it is green against pre-reskin `main`. If local e2e is unavailable, note it and rely on CI; the spec is authored against the current `LibraryClient`/`RacesClient`.

- [ ] **Step 3: Commit**

```bash
cd /Users/lou.fox/claude-foulox/tigerwolves-514-browse
git add e2e/browse-reskin-contract.spec.ts
git commit -m "test(#514): characterize browse interactive contract before reskin"
```

---

### Task 2: Shared browse-chip / search / button tokens in `lib/cardStyles.ts`

Add the browse-screen reskin strings to the existing Story-2 single-source so Library and Races stay in lockstep. **No unit test** — `cardStyles.ts` is UI styling verified by Preview + the e2e contract (the Story-2 precedent: these are style-string constants, and the epic rule is "purely visual → Preview-checked, don't assert Tailwind classes"). Behavior is locked by Task 1.

**Files:**
- Modify: `lib/cardStyles.ts`

**Interfaces:**
- Produces (consumed by Tasks 3 and 4):
  - `filterChip(active: boolean): string` — the `.k-chip` style; square, uppercase Jost 500, `tracking-[0.1em]`, `text-[11px]`; ink-filled white when `active`, transparent ink-text with hairline border when not. Includes `shrink-0` + `touch-manipulation` + `transition-colors`.
  - `SEARCH_FIELD: string` — the `.k-search` wrapper: `flex items-center gap-2.5 border border-line bg-card px-3 py-2.5`.
  - `SEARCH_INPUT: string` — borderless input inside it: `w-full bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none`.
  - Re-uses existing exports `OUTLINE_BTN`, `SQUARE_LABEL`, `CARD_LINK`, `TYPE_LABEL` (already present).

- [ ] **Step 1: Append the new exports to `lib/cardStyles.ts`** (keep the existing exports unchanged)

```ts
/** Browse-screen filter chip (.k-chip): square, uppercase Jost; ink-filled when active. */
export const filterChip = (active: boolean) =>
  `shrink-0 font-display uppercase tracking-[0.1em] text-[11px] font-medium px-3 py-1.5 touch-manipulation transition-colors ${
    active ? 'bg-ink text-white border border-ink' : 'bg-transparent text-ink border border-line'
  }`

/** Search field wrapper (.k-search): square hairline box holding a glyph + borderless input. */
export const SEARCH_FIELD = 'flex items-center gap-2.5 border border-line bg-card px-3 py-2.5'

/** Borderless search input inside SEARCH_FIELD. */
export const SEARCH_INPUT =
  'w-full bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none'
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/lou.fox/claude-foulox/tigerwolves-514-browse && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/cardStyles.ts
git commit -m "feat(#514): add browse-screen chip/search/button reskin tokens"
```

---

### Task 3: Reskin `LibraryClient.tsx` (search, filters, affordances)

Swap the browse-specific Tailwind classes for the square/monochrome tokens. **Only `className` strings and the search field's wrapper structure change** — every handler, `href`, `data-testid`, `data-tour`, `aria-label`, and the `type="search"` input binding stay identical. Keep the Story-2 card frames (`CARD_NAME`, `TYPE_LABEL`, `CARD_LINK`, `WorkoutCardBody`) untouched.

**Files:**
- Modify: `components/LibraryClient.tsx`
- Import: add `filterChip, SEARCH_FIELD, SEARCH_INPUT` to the existing `from '@/lib/cardStyles'` import (which already pulls `CARD_LINK, TYPE_LABEL, CARD_NAME`).

**Interfaces:**
- Consumes: `filterChip`, `SEARCH_FIELD`, `SEARCH_INPUT`, `SQUARE_LABEL` (Task 2).

**Element-by-element mapping** (anchors are current line numbers; apply by matching the class string, not the line):

| Element (approx line) | Current class → New class |
|---|---|
| Abbrev `?` button (194) | `...rounded-full border border-line text-muted...` → drop `rounded-full` (square): `w-8 h-8 flex items-center justify-center border border-line text-muted text-xs font-bold touch-manipulation` |
| Add `+` link (200) | `...rounded-full bg-accent text-white text-xl font-bold shadow-sm...` → `w-9 h-9 flex items-center justify-center bg-ink text-white text-xl font-bold touch-manipulation` (square, ink, no shadow) |
| Abbrev panel (208) | `...bg-surface rounded-xl border border-line` → `mx-4 mb-4 p-3 bg-surface border border-line` (drop `rounded-xl`) |
| Your run / All runs toggle (227, 231) | `text-xs font-semibold px-3 py-1.5 rounded-full touch-manipulation ${!showAllRuns ? 'bg-accent text-white' : 'bg-card border border-line text-muted'}` → `className={filterChip(!showAllRuns)}` and `className={filterChip(showAllRuns)}` |
| Category "All" + chips (254, 256) | `...rounded-full transition-colors ${active ? 'bg-accent text-white' : 'bg-card border border-line text-muted'}` → `className={filterChip(!category)}` / `className={filterChip(category === c)}` |
| Race-type "Any race" + chips (262, 264) | same pattern → `className={filterChip(!raceFilter)}` / `className={filterChip(raceFilter === r)}` |
| Type-filter "All types" + chips (271, 273) | same pattern → `className={filterChip(!typeFilter)}` / `className={filterChip(typeFilter === t)}` |
| Sort toggle (282, 286) | same pattern → `className={filterChip(sortBy === 'recent')}` / `className={filterChip(sortBy === 'rating')}` |
| "N versions" chip (366) | `text-xs font-semibold bg-surface text-muted border border-line px-2 py-0.5` → `className={SQUARE_LABEL}` |

- [ ] **Step 1: Restructure the search field** (lines ~239–250). Replace the `rounded-xl` input + absolutely-positioned 🔍 with the square `SEARCH_FIELD` wrapper and a leading glyph. **Keep `type="search"`, `value`, `onChange`, and `placeholder` exactly.**

```tsx
      {/* Search */}
      <div className="px-4 mb-3">
        <div className={SEARCH_FIELD}>
          <span className="text-muted text-sm" aria-hidden="true">⌕</span>
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, type, race distance…"
            className={SEARCH_INPUT}
          />
        </div>
      </div>
```

- [ ] **Step 2: Apply the mapping-table class swaps** (abbrev button, add link, abbrev panel, all four filter rows, the two sort buttons, the versions chip). Add `filterChip, SEARCH_FIELD, SEARCH_INPUT` to the `@/lib/cardStyles` import line.

- [ ] **Step 3: Grep to confirm no browse `rounded-*` or brand-color classes remain in the file**

```bash
cd /Users/lou.fox/claude-foulox/tigerwolves-514-browse
rg -n "rounded-(full|xl|2xl|lg)|bg-accent|bg-(red|green|yellow)-" components/LibraryClient.tsx || echo "clean"
```
Expected: `clean` (the card frames already use square `border border-line`; `WorkoutCardBody`/`ReactionPicker`/`AdoptRouteControls` are out of scope and unchanged).

- [ ] **Step 4: tsc + the Library specs (contract stays green, existing behavior intact)**

```bash
npx tsc --noEmit && npx playwright test e2e/browse-reskin-contract.spec.ts e2e/library.spec.ts
```
Expected: PASS — search/filter behavior unchanged; scoping/category/adopt/flag flows unchanged. If local e2e is unavailable, rely on CI.

- [ ] **Step 5: Commit**

```bash
git add components/LibraryClient.tsx
git commit -m "feat(#514): reskin Library browse chrome (search, filters, affordances) to NBR"
```

---

### Task 4: Reskin `RacesClient.tsx` (race card, countdown, verified, priority chips, add, sheets)

Same discipline: `className` swaps only; every handler/text/`data-testid`/`aria-label` stays. Monochrome the green/red/yellow status language; square every `rounded-*`.

**Files:**
- Modify: `components/RacesClient.tsx`
- Import: add `import { OUTLINE_BTN, SQUARE_LABEL } from '@/lib/cardStyles'`.

**Interfaces:**
- Consumes: `OUTLINE_BTN`, `SQUARE_LABEL`, `filterChip` (Task 2).

**Element-by-element mapping:**

| Element (approx line) | Current → New |
|---|---|
| "Add a race" button (223–230) | `...bg-accent text-white rounded-full pl-3 pr-4 py-2 text-sm font-bold shadow-sm` → `className={`${OUTLINE_BTN} inline-flex items-center gap-1.5`}` (ink outline, square; keep the `<Plus>` icon + "Add a race" text + `onClick={openAdd}`) |
| "N upcoming" count (222) | `text-xs font-bold text-muted` → `className={TYPE_LABEL}` (uppercase Jost label; add `TYPE_LABEL` to the import) |
| Race card (242) | `relative bg-card rounded-2xl p-4 border border-line shadow-sm` → `relative bg-card p-4 border border-line` (square, no shadow; keep `data-testid`) |
| Status dot verified (245) | `...rounded-full bg-green-500...` → `...rounded-full bg-ink...` (keep the circle shape — a dot is a dot — but ink not green; white `<Check>` stays) |
| Status dot flagged (249) | `...rounded-full bg-red-500...` → `...rounded-full bg-ink...` (white `<Flag>` stays) |
| Status dot unverified (253) | `...rounded-full bg-yellow-500...` → `...rounded-full bg-surface border border-line...`; the inner `<Clock>` goes `text-muted` (was `text-white`) |
| Days chip (262) | `...rounded-full ${days <= 30 ? 'bg-red-100 text-red-700' : 'bg-surface text-muted border border-line'}` → `className={SQUARE_LABEL}` (drop the red-urgency branch — monochrome; `{days}d` text unchanged) |
| Verified pill (266) | `text-[10.5px] font-bold text-green-800 bg-green-100 rounded-full px-2 py-0.5` → `className={SQUARE_LABEL}` (text "Verified" unchanged) |
| Unverified pill (268) | `text-[10.5px] font-bold text-muted bg-gray-200 rounded-full px-2 py-0.5` → `className={SQUARE_LABEL}` (text "Unverified" unchanged) |
| Priority chips (286–295) | `...rounded-full pl-2 pr-2.5 py-1.5 ${meta.pill} ${selected ? meta.ring : ''}` → square ink chip (see Step 1); keep `<Icon>` + `{meta.label} · {tally[tier]}` + `onClick={() => handleTag(...)}` |
| "Issue reported" button (301–308) | `...rounded-full bg-red-100 text-red-800...` → `...border border-line text-ink...` square (keep `<Flag>` + "Issue reported" + `onClick={openIssue}`) |
| "Flag an issue" button (310–317) | `...rounded-full border border-dashed border-line text-muted...` → drop `rounded-full` (square dashed; text + handler unchanged) |
| "Mark as verified" (318–328) | `...rounded-full bg-green-100 text-green-800...` → `...border border-ink text-ink...` square (keep `<Check>` + text + `onClick={submitVerify}` + `disabled`) |
| Sheet container (337–339) | `...rounded-t-2xl...` → drop `rounded-t-2xl` (square top) |
| All sheet inputs (357, 367, 376, 386, 395, 446, 496–513) | `rounded-xl`/`rounded-lg` → remove (square) |
| Sheet submit buttons (424, 458, 522) | `bg-accent text-white rounded-2xl` → `bg-ink text-white` (square) |
| Sheet cancel buttons (451, 477, 517) | `bg-surface text-muted rounded-2xl` → `bg-surface text-muted border border-line` (square) |
| Add-sheet tier chips (410) | same square-ink treatment as the card priority chips |
| Flag-note boxes (472, 489) | `text-red-800 bg-red-100 rounded-xl`/`rounded-lg` → `text-ink bg-surface border border-line` square (keep the "Reported by a runner" + `flagNote` text) |

**`TIER_META`:** the `pill` and `ring` fields encode the old pill+accent-ring styling. Simplify the chip rendering to a single square helper instead of threading `meta.pill`/`meta.ring` (see Step 1) — you may leave the `pill`/`ring` keys in the object unused, or drop them; prefer dropping them to avoid dead code (Global Constraints / self-review checklist).

- [ ] **Step 1: Replace the priority-chip className (both the card chips ~290 and the add-sheet chips ~410) with a square monochrome chip.** The chip is a label-shaped toggle, so build it from `SQUARE_LABEL` plus the selected/interactive bits:

```tsx
// card priority chips (and identically in the add sheet, which has no tally):
className={`${SQUARE_LABEL} inline-flex items-center gap-1 touch-manipulation ${
  selected ? 'bg-ink text-white border-ink' : ''
}`}
```
`SQUARE_LABEL` already supplies `border border-line text-muted` + square + uppercase Jost; the `selected` branch overrides to ink-fill. Keep `<Icon size={13} />` and the `{meta.label} · {tally[tier]}` / `{meta.label}` content exactly.

- [ ] **Step 2: Apply the mapping-table swaps** (add button, count label, card frame, three status dots, days chip, verified/unverified pills, the three footer buttons, the sheet container + inputs + submit/cancel buttons + flag-note boxes). Update the import line. Drop the now-unused `pill`/`ring` keys from `TIER_META` (and the `typeof Target` type fields they fed) if nothing else references them.

- [ ] **Step 3: Grep to confirm no browse `rounded-*` or brand-status colors remain** (form-validation `text-red-600` on the three error `<p>`s is the only allowed red — it's a functional error signal, not decoration)

```bash
cd /Users/lou.fox/claude-foulox/tigerwolves-514-browse
rg -n "rounded-(full|xl|2xl|lg)|bg-accent|bg-(red|green|yellow)-|text-(green|yellow)-|bg-gray-200|text-red-(700|800)" components/RacesClient.tsx || echo "clean"
rg -n "text-red-600" components/RacesClient.tsx   # expect: only the 3 form-error <p> lines
```
Expected: first grep `clean`; second shows only the validation-error paragraphs.

- [ ] **Step 4: tsc + the Races specs (contract stays green, existing behavior intact)**

```bash
npx tsc --noEmit && npx playwright test e2e/browse-reskin-contract.spec.ts e2e/races.spec.ts
```
Expected: PASS — add/tag/verify/flag + the fixture verified/flagged states unchanged. If local e2e is unavailable, rely on CI.

- [ ] **Step 5: Commit**

```bash
git add components/RacesClient.tsx
git commit -m "feat(#514): reskin Races (card, countdown, verified, priority chips, sheets) to NBR monochrome"
```

---

### Task 5: Full verification + Preview handoff

**Files:** none (verification only).

- [ ] **Step 1: Full unit suite + tsc**

```bash
cd /Users/lou.fox/claude-foulox/tigerwolves-514-browse
npx vitest run && npx tsc --noEmit
```
Expected: all green (662+ pass, 0 fail). (`npm run test:unit` is the CI equivalent, run against the `test-data` branch.)

- [ ] **Step 2: Full browse e2e locally where possible**

```bash
npx playwright test e2e/browse-reskin-contract.spec.ts e2e/library.spec.ts e2e/races.spec.ts
```
Expected: all green. If local e2e is unavailable, note it and rely on CI.

- [ ] **Step 3: Preview visual check (Lou)** — on the PR's Preview URL, against `#library` and `#races` in the prototype:
  - **Library:** square search box with the ⌕ glyph; filter chips are square, uppercase Jost, ink-filled when active; author lines + "Show details" read as NBR; abbrev/add buttons square (ink `+`).
  - **Races:** "Add a race" is an ink outline button; race card is square, no heavy shadow; the verified/unverified state and countdown are **monochrome** (no green/red/yellow); priority chips are square and ink-fill when selected; the bottom sheets (add / flag / view / fix) are square with ink submit buttons.
  - Utility-screen rhythm intact (Library/Races still use the compact dark `Header`; mastheads are hero-only).
  - No schema migration in this story — no DB steps on any branch.

---

## Noticed, out of scope (flag to Lou, do not fix here)

- **Form-validation error text stays `text-red-600`** on the add/flag/fix sheets. NBR's system is strictly monochrome, but red is the conventional error-state signal and no test asserts its color — left as-is deliberately. If Lou wants it brand-pure, swap to `text-ink` with a bold weight in a one-line follow-up.
- The status **dot** is kept (recolored to ink) rather than removed; the prototype leans on the textual "Verified" label instead of a dot. Dropping the dot is a layout change, not a reskin — out of scope here; worth a Preview decision.
