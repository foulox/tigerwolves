# NBR v2 Story 2 — Shared Workout-Card Reskin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin the shared workout-card surface (the resolver-driven body + each screen's card frame) to NBR's real design system across My Plan, Schedule/per-run, and Library — square corners, hairline borders, Jost names, uppercase type **labels** (not gray rounded pills), cyan links, ink "NEXT UP" left-rule — changing presentation only, never behavior.

**Architecture:** Epic #423 made the card *body* shared (`WorkoutCardBody`), but each screen still owns its card *frame* (wrapper, name, date, type pill, reactions/flag row). So this reskin touches the shared body + primitives **once** and each of the three frames **once**, driven by a small shared class-constant module (`lib/cardStyles.ts`) so the NBR label/link/chip styles are defined in one place and can't drift across files. Because a reskin changes only presentation, the safety net is an **e2e characterization spec** that pins the card's interactive contract and stays green through every reskin task — not unit tests that assert Tailwind classes (brittle, and they'd break on every intended restyle).

**Tech Stack:** Next.js (App Router) · React · Tailwind CSS v4 (`@theme` tokens in `app/globals.css`) · Playwright (e2e) · Vitest (unit) · TypeScript.

**Spec:** `docs/superpowers/plans/2026-10-11-nbr-redesign-spec.md` (Story 2 section) · epic #510 · issue #512 · visual target: `docs/superpowers/plans/2026-10-11-nbr-prototype.html` (`.k-card` family).

## Global Constraints

Copied verbatim from the spec/epic — every task's requirements implicitly include these:

- **Monochrome base; cyan `#00c3eb` (`text-link`) for LINKS ONLY, never decoration.** Inline navigational text links (View route ↗, Map ↗, Show details, + Add variation, run-identity link) are cyan. Button-shaped controls (Edit schedule →, Edit in library →) are ink **outline**, not cyan, not filled.
- **Square corners** (remove `rounded-2xl` / `rounded-full` / `rounded-lg` on the card surface; 0 radius, 2px max).
- **Display font = Jost** via the existing `font-display` utility (Story 1 wired `--font-display: var(--font-jost)` in `app/globals.css`). Body font = Mulish (default `font-sans`, already applied). Type rules from the site: headlines = Jost 400 title-case; labels/nav/buttons = Jost 500 UPPERCASE with wide tracking.
- **Do NOT remove `--color-accent`.** Story 1 left it as a deprecated ink (`#1f1f1f`) shim; the *final* story removes it. This story migrates the card components **off** `text-accent`/`border-accent` onto explicit `text-link`/`text-ink`/`border-ink`, but leaves the token itself in place for the out-of-scope components still using it.
- **Reskin only — no behavior change.** Reactions, flags, expand/collapse, links, navigation, `aria-expanded`, `aria-label`s, and all `data-testid`s must be byte-for-byte preserved. The characterization spec is the teeth behind this.
- **Testing rule (epic-wide, verbatim):** purely visual attributes (color, font, corners, spacing) stay **Preview-checked against the prototype** — do **not** assert Tailwind classes in tests. **Do not** add visual-regression / screenshot testing. A rewrite of an existing interactive component must be test-locked by an e2e characterization spec that passes on the current component and stays green through the reskin.
- **Out of scope (do not touch):** ScheduleClient planning/browse chrome (filters, pills, verify button, selection cards); Library search/sort/filter chrome and author lines (that's Story 4); `CardLayoutPreview.tsx`'s own frame (Story 5 — its embedded body reskins automatically via `WorkoutCardBody` and that is the desired "reuses the Story-2 skin"); `ReactionPicker.tsx` internals ("reactions unaffected"); `WorkoutFlagSheet.tsx` drawer internals (behavior unaffected; its `bg-accent` is already monochrome ink via the shim).

## Review Focus

Inputs/conditions the spec implies but that the reskin class-swaps won't naturally exercise — each pinned by the characterization spec (Task 1) or its owning task:

- **Unplanned entry ("Not planned yet"):** card renders, is non-interactive (no `role="button"`, no expand), and shows no type label (compact is null / `shape !== 'workout'`). → pinned in Task 1.
- **Past cards (muted) + leader "Edit in library →":** past styling still reads muted and the leader-only `edit-in-library-${index}` link still navigates to `/library/edit?variantId=`. → pinned in Task 1 (this is a current e2e **gap**).
- **Card with no workout body (`hasWorkout === false`):** expand is disabled, no detail panel, no reactions. → pinned in Task 1.
- **Flagged / "Issue reported" state:** both the flagged badge and the issue-reported chip still render and open their sheet after going monochrome. → owned by Task 6.
- **Long workout names:** `truncate` still clips a long name with the Jost 400 / 19px name style (no overflow). → Preview-checked in Task 7; `truncate` class preserved in Tasks 3–5.

---

### Task 1: Characterization test-lock (the teeth — runs BEFORE any reskin)

Pin the card's full interactive contract with a single e2e spec that passes on the **current** (pre-reskin) renderer. This is a characterization test: it encodes existing behavior, so it is green the moment it's written. It then stays green through every reskin task and in CI on the PR. Covers the current gaps the existing specs miss (Edit-in-library, reactions in the detail panel, unplanned/no-body cards).

**Files:**
- Create: `e2e/card-reskin-contract.spec.ts`
- Reference (do not modify): `e2e/my-plan.spec.ts`, `e2e/per-run.spec.ts`, `e2e/library.spec.ts` (existing patterns, `setFollow` helper, auth), `components/GroupRunCard.tsx`, `components/MyPlanCard.tsx`, `components/WorkoutCardBody.tsx`

**Interfaces:**
- Consumes: existing testids — `my-plan-card-${runId}-${date}`, `my-plan-run-link-${runId}`, `my-plan-type-${runId}`, `schedule-card-${index}`, `schedule-detail-${index}`, `past-card-${index}`, `past-detail-${index}`, `schedule-route-${index}`, `schedule-week-${index}`, `edit-in-library-${index}`; reaction buttons `button[aria-label^="React "]`; flag ghost `button[aria-label^="Flag an issue with "]`; flagged badge `button[aria-label="Issue reported — view details"]`; `button[name="Show details"]` / `"Hide details"`.
- Produces: a stable spec that every later task re-runs unchanged. **No later task may edit this file** — if a reskin tempts you to change a selector or assertion here, the reskin broke the contract; fix the component, not the test.

- [ ] **Step 1: Write the characterization spec**

Mirror the auth/`setFollow` setup used in `e2e/my-plan.spec.ts`. Assert behavior and content only — **never** Tailwind classes, colors, or fonts. Cover:

```ts
import { test, expect } from '@playwright/test'
import { setFollow } from './helpers' // match the actual helper import used in my-plan.spec.ts

// Card interactive contract — locked before the NBR Story-2 reskin (#512) and kept
// green through it. Presentation changes; every behavior below must survive.
test.describe('workout card interactive contract', () => {
  test('My Plan: collapsed by default; Show details toggles the panel; run link + type label present', async ({ page }) => {
    await setFollow(page, 'tuesday-morning-tigerwolves', true)
    await page.goto('/my-plan')
    await page.waitForLoadState('load')
    const card = page.locator('[data-testid^="my-plan-card-tuesday-morning-tigerwolves-"]').first()
    await expect(card.getByText('race-specific coordination')).toHaveCount(0)
    await expect(card.getByTestId('my-plan-run-link-tuesday-morning-tigerwolves')).toBeVisible()
    await expect(card.getByTestId('my-plan-type-tuesday-morning-tigerwolves')).toBeVisible()
    const showBtn = card.getByRole('button', { name: 'Show details' })
    await showBtn.click()
    await expect(card.getByText('race-specific coordination')).toBeVisible()
    await expect(card.getByRole('button', { name: 'Hide details' })).toBeVisible()
  })

  test('My Plan: reactions picker opens, a pick closes it', async ({ page }) => {
    await setFollow(page, 'monday-morning-easy-run', true)
    await page.goto('/my-plan')
    await page.waitForLoadState('load')
    const card = page.locator('[data-testid^="my-plan-card-monday-morning-easy-run-"]').first()
    await card.locator('button', { hasText: 'React' }).click()
    const emoji = page.locator('button[aria-label^="React "]').first()
    await expect(emoji).toBeVisible()
    await emoji.click()
    await expect(page.locator('button[aria-label^="React "]')).toHaveCount(0)
  })

  test('Schedule (per-run): card expands and collapses; View route link + Edit schedule nav work', async ({ page }) => {
    await page.goto('/runs/tuesday-morning-tigerwolves')
    await page.waitForLoadState('load')
    const card = page.locator('[data-testid="schedule-card-0"]')
    await card.click()
    await expect(page.locator('[data-testid="schedule-detail-0"]')).toBeVisible()
    await card.click()
    await expect(page.locator('[data-testid="schedule-detail-0"]')).toBeHidden()
    const editBtn = page.locator('[data-testid="schedule-week-0"]')
    await expect(editBtn).toContainText('Edit schedule')
    await editBtn.click()
    await page.waitForURL(/\/schedule\?week=0/)
  })

  test('Schedule (per-run): past card exposes leader "Edit in library" and it navigates', async ({ page }) => {
    await page.goto('/runs/tuesday-morning-tigerwolves')
    await page.waitForLoadState('load')
    const editInLib = page.locator('[data-testid="edit-in-library-0"]')
    if (await editInLib.count() === 0) test.skip(true, 'no past card with a workout in fixtures')
    await expect(editInLib).toContainText('Edit in library')
    await editInLib.click()
    await page.waitForURL(/\/library\/edit\?variantId=/)
  })
})
```

> **Executor note:** the exact `setFollow` import path, the fixture run slugs, and whether a past card with a workout exists in the e2e fixtures must be verified against the real `e2e/` helpers and seed before finalizing — adjust slugs/skips to match. The spec must run green on current `main` with no component changes. If a selector doesn't resolve on current code, the selector is wrong (fix the spec), **not** the component.

- [ ] **Step 2: Run the spec green on the current (un-reskinned) renderer**

Run: `npm run test:e2e -- card-reskin-contract`
Expected: PASS (all cases green against current code). This proves the contract is correctly characterized before any visual change. (If local Playwright flakes under `next dev` on unrelated specs, scope to this file only; the authoritative green is CI.)

- [ ] **Step 3: Commit**

```bash
git add e2e/card-reskin-contract.spec.ts
git commit -m "test(#512): characterize workout-card interactive contract before NBR reskin"
```

---

### Task 2: Shared card styles module + body + primitives

Create the one-place style constants, then migrate the shared body (`WorkoutCardBody`) and card primitives (`WorkoutDetails`) onto them: links → cyan uppercase Jost, phase/race pills → square uppercase labels, Show/Hide-details → cyan link, route-map image → square.

**Files:**
- Create: `lib/cardStyles.ts`
- Modify: `components/WorkoutCardBody.tsx` (links line ~63–75 & ~234–241; pills line ~162–199; image line ~86–92)
- Modify: `components/WorkoutDetails.tsx` (ChipRow line ~29–33; `PHASE_COLORS` is already monochrome; Map ↗ link line ~115–124; map image line ~100–113)

**Interfaces:**
- Produces (`lib/cardStyles.ts` — exact exported string constants, consumed by Tasks 2–6):

```ts
// NBR Story-2 card skin — single source for the reskin so the label/link/chip
// styles can't drift across the four card frames. Tailwind v4 class strings.
// `font-display` = Jost (wired by Story 1). Cyan = links only. Square corners.

/** Inline navigational text link: View route ↗, Map ↗, Show details, + Add variation. */
export const CARD_LINK =
  'font-display uppercase tracking-[0.1em] text-[11px] font-medium text-link no-underline touch-manipulation'

/** Workout type: bare uppercase label, no pill background/border. */
export const TYPE_LABEL =
  'font-display uppercase tracking-[0.14em] text-[10px] font-medium text-muted whitespace-nowrap'

/** Phase / race / variation chip: square bordered label. */
export const SQUARE_LABEL =
  'font-display uppercase tracking-[0.1em] text-[10px] font-medium text-muted border border-line px-2 py-1'

/** "NEXT UP" eyebrow: wide-tracked ink label. */
export const NEXT_UP_LABEL =
  'font-display uppercase tracking-[0.2em] text-[9px] font-semibold text-ink'

/** Button-shaped navigational control (Edit schedule →, Edit in library →): ink outline, square. */
export const OUTLINE_BTN =
  'font-display uppercase tracking-[0.1em] text-[10px] font-medium text-ink border border-ink px-3 py-1 active:bg-surface touch-manipulation whitespace-nowrap'

/** Workout name: Jost regular, title-case (markup supplies the case). */
export const CARD_NAME = 'font-display font-normal text-[19px] text-ink leading-tight'
```

- Consumes: nothing (first reskin task).

- [ ] **Step 1: Create `lib/cardStyles.ts`** with exactly the constants above.

- [ ] **Step 2: Migrate `WorkoutCardBody.tsx` links.** Replace the `link` case className (currently `text-xs font-semibold text-accent touch-manipulation block`) with `` `${CARD_LINK} block` `` and the Show/Hide-details button className (currently `text-xs font-semibold text-accent touch-manipulation`) with `CARD_LINK`. Import `CARD_LINK` from `@/lib/cardStyles`. Keep `onClick`, `stopPropagation`, `aria-expanded`, `href`, `target`, `rel` untouched.

- [ ] **Step 3: Migrate `WorkoutCardBody.tsx` pills → square labels.** In `renderGroupSide`, both the `race` and `phase` branches currently render `<span>`s with `... px-2 py-0.5 rounded-full`. Replace each span's className with `SQUARE_LABEL`. Remove the `rounded-full`. (The merged pills wrapper `flex flex-wrap gap-1.5` stays.)

- [ ] **Step 4: Migrate `WorkoutCardBody.tsx` route-map image.** Change the `image` case `<img>` className `... rounded-lg border border-line bg-surface` → `... border border-line bg-surface` (drop `rounded-lg`).

- [ ] **Step 5: Migrate `WorkoutDetails.tsx`.** `ChipRow` span: replace `text-xs rounded-full px-2.5 py-0.5 ...` default with `SQUARE_LABEL` (when no `getChipClass` override); the Map ↗ link className `text-xs font-semibold text-accent touch-manipulation block` → `` `${CARD_LINK} block` ``; the map `<img>` `... rounded-lg ...` → drop `rounded-lg`. Import from `@/lib/cardStyles`. Leave `DetailRow` and `PHASE_COLORS` as-is (already monochrome; phase chips pick up square corners because the render sites drop `rounded-full`).

- [ ] **Step 6: Typecheck + unit + contract still green.**

Run: `npx tsc --noEmit && npm run test:unit`
Expected: PASS (no type errors; existing unit tests unaffected).
Run: `npm run test:e2e -- card-reskin-contract`
Expected: PASS (interactive contract unchanged).

- [ ] **Step 7: Commit**

```bash
git add lib/cardStyles.ts components/WorkoutCardBody.tsx components/WorkoutDetails.tsx
git commit -m "feat(#512): NBR skin for shared card body + primitives (links, pills, images)"
```

---

### Task 3: Schedule card frame (`GroupRunCard.tsx`)

Reskin the Schedule/per-run card frame: square hairline wrapper (no shadow), NEXT UP ink left-rule + eyebrow label, type pill → bare uppercase label, name → Jost 400, View-route → cyan link, Edit-schedule/Edit-in-library → ink outline buttons.

**Files:**
- Modify: `components/GroupRunCard.tsx` (wrapper ~56–61; NEXT UP ~73; name ~77; set/distance/route lines ~81–102; type pill ~109–115; edit links ~117–136)

**Interfaces:**
- Consumes: `CARD_LINK`, `TYPE_LABEL`, `NEXT_UP_LABEL`, `OUTLINE_BTN`, `CARD_NAME` from `@/lib/cardStyles`.
- Produces: nothing new.

- [ ] **Step 1: Wrapper → square hairline, ink left-rule for next.** Replace the wrapper className:
  - from: `` `rounded-2xl shadow-sm border touch-manipulation ${isPast ? 'bg-surface border-line' : isNext ? 'bg-card border-accent' : 'bg-card border-line'}` ``
  - to: `` `border touch-manipulation ${isPast ? 'bg-surface border-line' : isNext ? 'bg-card border-ink border-l-[3px]' : 'bg-card border-line'}` ``
  (Drops `rounded-2xl` and `shadow-sm` for the flat bordered prototype look; `isNext` gets the 3px ink left-rule replacing the former accent border.)

- [ ] **Step 2: NEXT UP eyebrow.** Replace `<div className="text-xs font-bold text-accent tracking-wide mb-1">NEXT UP</div>` → `` <div className={`${NEXT_UP_LABEL} mb-1`}>NEXT UP</div> ``.

- [ ] **Step 3: Workout name → Jost.** On the name `<div>` (line ~77), for the non-past branch replace `text-base font-bold text-ink` with `CARD_NAME` (keep `mt-0.5 truncate`); leave the `isPast` muted branch as `text-sm font-semibold text-muted` but add `font-display` so past names are Jost too. Keep the "Not planned yet" italic muted span.

- [ ] **Step 4: Type pill → label.** Replace the type `<span>` className `` `text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${TYPE_PILL}` `` with `TYPE_LABEL`, and delete the now-unused `const TYPE_PILL` at the top of the file.

- [ ] **Step 5: Links.** `View route ↗` link className `font-semibold text-accent touch-manipulation` → `CARD_LINK`. `Edit in library →` link className (`text-xs font-semibold text-muted border border-line rounded-full px-3 py-1 bg-card active:bg-surface touch-manipulation whitespace-nowrap`) → `OUTLINE_BTN`. `Edit schedule →` link className (`text-xs font-semibold text-accent border border-accent rounded-full px-3 py-1 active:bg-surface touch-manipulation whitespace-nowrap`) → `OUTLINE_BTN`. Keep every `href`, `data-testid`, `onClick`/`stopPropagation`.

- [ ] **Step 6: Typecheck + unit + contract green.**

Run: `npx tsc --noEmit && npm run test:unit && npm run test:e2e -- card-reskin-contract`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/GroupRunCard.tsx
git commit -m "feat(#512): NBR skin for Schedule/per-run card frame"
```

---

### Task 4: My Plan card frame (`MyPlanCard.tsx`)

Reskin the My Plan card frame to match: square hairline wrapper, run-identity link → cyan, name → Jost, type pill → label.

**Files:**
- Modify: `components/MyPlanCard.tsx` (wrapper ~51; run link ~54–61; name ~66; type pill ~70–77)

**Interfaces:**
- Consumes: `CARD_LINK`, `TYPE_LABEL`, `CARD_NAME` from `@/lib/cardStyles`.

- [ ] **Step 1: Wrapper → square hairline, no shadow.** Replace `rounded-2xl shadow-sm border border-line bg-card touch-manipulation` → `border border-line bg-card touch-manipulation`.

- [ ] **Step 2: Run-identity link → cyan.** Replace the `Link` className `inline-flex items-center gap-1 text-xs font-bold tracking-wide text-accent touch-manipulation` → `` `${CARD_LINK} inline-flex items-center gap-1` ``. Keep `data-testid`, `href`, the emoji/name/`›` children.

- [ ] **Step 3: Name → Jost.** On the name `<div>` replace `text-base font-bold text-ink` with `CARD_NAME` (keep `mt-0.5 truncate`). Keep "Not planned yet" italic muted span.

- [ ] **Step 4: Type pill → label.** Replace the type `<span>` className `` `shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${TYPE_PILL}` `` → `` `shrink-0 ${TYPE_LABEL}` `` and delete the now-unused `const TYPE_PILL`. Keep `data-testid`.

- [ ] **Step 5: Typecheck + unit + contract green.**

Run: `npx tsc --noEmit && npm run test:unit && npm run test:e2e -- card-reskin-contract`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/MyPlanCard.tsx
git commit -m "feat(#512): NBR skin for My Plan card frame"
```

---

### Task 5: Library card frame (`LibraryClient.tsx` workout-card rows only)

Reskin **only the workout-card rows** (standalone + family), not the search/sort/filter chrome (Story 4). Square hairline wrappers, type pill → label, name → Jost, `+ Add variation` → cyan link, `✎` edit control → square.

**Files:**
- Modify: `components/LibraryClient.tsx` — the standalone card (`data-testid="workout-card"`, ~`bg-card rounded-2xl p-4 border border-line shadow-sm`), the family card button (same wrapper), the type `<span>` (`... rounded-full`), the `✎` edit `Link` (`... rounded-full`), the `+ Add variation` link (`text-accent`), the workout-name `<div>` (`font-semibold text-ink`).

**Interfaces:**
- Consumes: `CARD_LINK`, `TYPE_LABEL`, `CARD_NAME` from `@/lib/cardStyles`.

- [ ] **Step 1: Card wrappers → square hairline.** For both the standalone card `<div>` and the family card `<button>`, replace `bg-card rounded-2xl p-4 border border-line shadow-sm` → `bg-card p-4 border border-line` (drop `rounded-2xl` + `shadow-sm`; keep `w-full text-left touch-manipulation` on the family button). Keep every `data-testid`, `data-tour`, `onClick`.

- [ ] **Step 2: Workout name → Jost.** Replace the card-name `<div className="font-semibold text-ink">` → `<div className={CARD_NAME}>` in both the standalone and family rows. (The small `w.label` sub-line stays `text-xs text-muted`.)

- [ ] **Step 3: Type pill → label.** Replace the type `<span className="text-xs font-semibold bg-surface text-muted border border-line px-2 py-1 rounded-full">` → `<span className={TYPE_LABEL}>`.

- [ ] **Step 4: Edit `✎` control → square.** Replace the edit `Link` className `w-7 h-7 flex items-center justify-center rounded-full border border-line text-muted text-xs touch-manipulation` → same without `rounded-full` (square icon button). Keep `title="Edit workout"` and `href`.

- [ ] **Step 5: `+ Add variation` → cyan link.** Replace that `Link` className `text-xs font-semibold text-accent touch-manipulation` → `CARD_LINK`. Keep `href`.

- [ ] **Step 6: Typecheck + unit + contract green.**

Run: `npx tsc --noEmit && npm run test:unit && npm run test:e2e -- card-reskin-contract`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/LibraryClient.tsx
git commit -m "feat(#512): NBR skin for Library workout-card rows"
```

---

### Task 6: Flagged / "Issue reported" state → monochrome

The prototype's flag affordance is a gray/cyan `.k-link` ("⚑ Flag"); it has no red "Issue reported" badge, so this state is undefined by the design. Per the locked **monochrome** decision (red is explicitly "not an NBR color"), convert the red flag/issue-reported chrome on the card surface to monochrome. **This is the plan's one open design call** — see Execution Handoff; default to monochrome, but hold for Lou's confirmation that losing the red warning salience is acceptable.

**Files:**
- Modify: `components/GroupRunCard.tsx` — the expanded-panel "Issue reported" button (`bg-red-100 text-red-800 rounded-full ...`, ~line 178).
- Modify: `components/MyPlanCard.tsx` — the "Issue reported" `<span>` (`rounded-full bg-red-100 ... text-red-800`, ~line 90).

**Interfaces:**
- Consumes: nothing new (inline classes).

- [ ] **Step 1: GroupRunCard "Issue reported" button → monochrome square.** Replace `flex items-center gap-1.5 bg-red-100 text-red-800 rounded-full px-3 py-1.5 text-xs font-bold shrink-0 touch-manipulation` → `flex items-center gap-1.5 border border-ink text-ink px-3 py-1.5 text-xs font-bold shrink-0 touch-manipulation` (square ink outline; keep the `<Flag>` icon + "Issue reported" text + `onClick`).

- [ ] **Step 2: MyPlanCard "Issue reported" chip → monochrome square.** Replace `flex shrink-0 items-center gap-1.5 rounded-full bg-red-100 px-3 py-1.5 text-xs font-bold text-red-800` → `flex shrink-0 items-center gap-1.5 border border-ink px-3 py-1.5 text-xs font-bold text-ink`. Keep the `<Flag>` icon + text.

- [ ] **Step 3: Typecheck + unit + contract green.**

Run: `npx tsc --noEmit && npm run test:unit && npm run test:e2e -- card-reskin-contract`
Expected: PASS (flag flow behavior unchanged; library.spec.ts flag round-trip still green).

- [ ] **Step 4: Commit**

```bash
git add components/GroupRunCard.tsx components/MyPlanCard.tsx
git commit -m "feat(#512): monochrome flag / issue-reported state on cards"
```

---

### Task 7: Full-suite verification + Preview visual sign-off

No new code — the completion gate. Confirm the whole reskin is green and visually matches the prototype across all three card screens, and resolve the spec's deferred on-device question about the NEXT UP left-rule.

**Files:** none (verification only).

- [ ] **Step 1: Full local suite.**

Run: `npx tsc --noEmit && npm run test:unit && npm run test:e2e`
Expected: PASS (unit + full e2e, including `card-reskin-contract`, `my-plan`, `per-run`, `library`, `schedule`). Note any pre-existing `next dev` local flake vs CI.

- [ ] **Step 2: Confirm no leftover old skin on the card surface.**

Run: `rg -n "rounded-2xl|rounded-full|text-accent|border-accent|bg-red-100" components/GroupRunCard.tsx components/MyPlanCard.tsx components/WorkoutCardBody.tsx components/WorkoutDetails.tsx lib/cardStyles.ts`
Expected: no matches on the card surface (remaining `rounded-*`/`text-accent` elsewhere in LibraryClient/ScheduleClient belong to out-of-scope chrome — do not touch).

- [ ] **Step 3: Confirm `font-display` resolves to Jost.** Verify Story 1's `--font-display: var(--font-jost)` is present in `app/globals.css` and that the `font-display` utility is generated (Tailwind v4 maps `--font-*` → `font-*`). On Preview, a card name renders in Jost, not the body font.

- [ ] **Step 4: Preview visual check against the prototype** (`docs/superpowers/plans/2026-10-11-nbr-prototype.html`, `.k-card`). On the PR's Preview URL, across **My Plan, the per-run Schedule page, and Library**: square cards + hairline `#e6e5e5` borders, no shadow; Jost title-case names; uppercase gray type **labels** (no pills); cyan inline links; ink outline Edit buttons; square phase/race labels; the NEXT UP card shows the 3px ink left-rule + wide-tracked eyebrow. Also check a signed-in leader (Clerk test account) so the leader-only Edit controls render.

- [ ] **Step 5: Resolve the deferred NEXT UP question (spec Open Questions).** On Preview/device, confirm the ink left-rule reads strongly enough as the "soonest run" emphasis; if it doesn't, note it for a follow-up (filled-ink header strip) — don't block the PR on it.

---

## Self-Review

**1. Spec coverage.** Story 2 scope lines → tasks: square cards + hairline borders → Tasks 3/4/5 wrappers; Jost names → `CARD_NAME` (Tasks 3/4/5); type pills → uppercase labels → `TYPE_LABEL` (Tasks 2/3/4/5); cyan links → `CARD_LINK` (Tasks 2/3/4/5); ink "NEXT UP" emphasis → Task 3; phase/race pills → square labels → `SQUARE_LABEL` (Task 2); "reactions/flags unaffected" → Task 1 characterization + Task 6 monochrome flag; "cards match the prototype across My Plan / Schedule / Library" → Tasks 3/4/5 + Task 7 Preview. Covered.

**2. Placeholder scan.** No TBD/"handle edge cases"/"similar to Task N" — every class string is spelled out; the characterization spec is full code (with an explicit executor note to verify fixture slugs/helper import against the real `e2e/`).

**3. Type consistency.** The six `lib/cardStyles.ts` constant names (`CARD_LINK`, `TYPE_LABEL`, `SQUARE_LABEL`, `NEXT_UP_LABEL`, `OUTLINE_BTN`, `CARD_NAME`) are defined in Task 2 and referenced by those exact names in Tasks 3–5.

**4. Review Focus.** Each listed condition is pinned: unplanned/no-body/past-leader-edit in Task 1; flagged state in Task 6; long-name truncation Preview-checked in Task 7 with `truncate` preserved.
