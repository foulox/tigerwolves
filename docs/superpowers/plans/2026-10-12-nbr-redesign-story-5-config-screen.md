# NBR v2 — Story 5: Card-layout config screen reskin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin epic #423's Card-layout config screen (`CardTemplateTab` + its embedded `CardLayoutPreview`) from the off-brand #466 look (emerald/blue/gray/orange, rounded) to the NBR brand-true visual language (monochrome ink/line/muted, square corners, Jost uppercase labels) — presentation only, every control and handler preserved.

**Architecture:** Two client components change. `CardTemplateTab.tsx` renders the three section editors (upfront / expanded / hidden bin) with per-row move controls and per-field chips (move-to-section / align / split) plus the Save button. `CardLayoutPreview.tsx` renders the workout picklist, the My Plan / Schedule / Library surface-tab picker, and a frame that mounts the already-Story-2-reskinned `WorkoutCardBody`. The reskin reuses the existing NBR skin vocabulary in `lib/cardStyles.ts` and the `@theme` tokens in `app/globals.css` (ink `#1f1f1f`, line `#e6e5e5`, muted `#747474`, `font-display` = Jost). A new e2e characterization spec locks the interactive contract before any JSX is touched, per the epic-wide testing rule.

**Tech Stack:** Next.js (App Router) client components, Tailwind v4 (`@theme` tokens), Playwright e2e (leader `storageState`), Vitest unit tests.

**Spec:** Epic #510 (`docs/superpowers/plans/2026-10-11-nbr-redesign-spec.md`, `2026-10-11-nbr-design-system.md`, config screen in `2026-10-11-nbr-prototype.html` `#config`). Issue #515.

## Global Constraints

- **Reskin only — no behavior change.** Every `onClick`, every `aria-label`, the Save flow, and the section/move/align/split/picker/surface logic are preserved byte-for-byte in behavior. Presentation (color, font, corners, spacing) is all that changes.
- **Monochrome + cyan-for-links-only.** Use `text-ink` / `text-muted` / `border-line` / `bg-surface` / `bg-card` / `bg-ink`. No emerald, blue, gray-N, orange, rose, or `*-accent` fills. Cyan (`text-link`) is reserved for navigational links only — it does not appear on this screen's controls.
- **Square corners.** No `rounded-*` except where a token/`cardStyles` constant already encodes a radius. Replace `rounded-xl`/`rounded-lg`/`rounded-2xl`/`rounded-full` with square (no radius).
- **Jost uppercase for labels/buttons.** Section titles, row labels, and chip controls use `font-display uppercase tracking-[…]` consistent with `lib/cardStyles.ts`. Reuse `cardStyles` constants where they fit rather than re-deriving class strings.
- **`touch-manipulation` stays on every interactive element** (mobile-first; existing elements already have it — do not drop it).
- **`aria-label` on every icon-only / glyph-only control is preserved.** The reskin must not drop or change any existing `aria-label`.
- **Do NOT remove the `--color-accent` token** (globals.css:17). Despite its "removed in final story" comment, it is still consumed by ~8 out-of-scope components (ScheduleClient, AllRunsClient, MyPlanClient, RunFollowToggle, WorkoutFlagSheet, LeaderPicker, AdoptRouteControls). Removing it is its own cleanup story — out of scope for #515. Within the two files this story touches, migrate the single `text-accent` usage in `CardLayoutPreview` to `text-ink`.

## Review Focus

Inputs the spec implies but that a hand-edited reskin can silently break — each pinned by the Task 1 lock:

- **A control wired to the wrong handler or a dropped `onClick`** → the button renders but does nothing. Pinned: every lock assertion clicks a control and asserts an observable state change (field appears in Hidden, aria-pressed flips), not just that the control exists.
- **A dropped `aria-label`** → icon/glyph controls become unreachable by assistive tech and by `getByRole(name:)`. Pinned: the lock addresses controls by accessible name, so a dropped label fails the lock.
- **An empty section** (`hidden: []` default) → the Hidden bin must still render its empty-state copy and still accept a moved field. Pinned: Task 1 test A starts from the default (empty hidden), moves a field in, and asserts it lands.
- **The align toggle's active state** → expressed only via class in the current component, which the epic rule forbids asserting. Pinned: Task 2 adds `aria-pressed` to both align buttons (a11y improvement + class-free observable); Task 1 writes that attribute onto the current component first so the lock is class-free from the start.
- **The preview with zero library workouts** → `CardLayoutPreview` early-returns an empty-state `<p>`. Pinned: Task 1 test C asserts defensively — it only drives the picker/surface controls when a preview card is present, and asserts the empty-state copy otherwise.

---

### Task 1: Characterization lock for the config screen (green on the current component)

Write the e2e spec that locks move / alignment / hidden-bin / save and the preview's picker + surface-tab controls. It must pass on the **current** (off-brand) component so it can stay green through the reskin. The align toggle has no class-free observable today, so this task first adds `aria-pressed` to the two align buttons in the current `CardTemplateTab` — a pure a11y improvement, no visual change — then the lock asserts against it.

**Files:**
- Modify: `components/CardTemplateTab.tsx` (FieldChip align buttons — add `aria-pressed` only; lines ~265–280)
- Create: `e2e/card-config-reskin-contract.spec.ts`

**Interfaces:**
- Consumes: leader `storageState` (default project config); route `/run-config`; tab button `Card layout`; the current component's accessible names — `Move {label} to hidden`, `Move {label} to Show upfront`, `Move {label} to When expanded`, `Align {label} left`, `Align {label} right`, `Split {label} to its own row`, `Move row {n} up in {section}`, `Move row {n} down in {section}`, `Merge row {n} up with previous row in {section}`, `Choose a workout to preview`; Save button label `Save card layout` → `Saved!`. Field labels from `CARD_FIELD_LABELS` (e.g. `Description`, `Author`, `Coaching notes`).
- Produces: `e2e/card-config-reskin-contract.spec.ts` — the test-lock Tasks 2 and 3 must keep green.

- [ ] **Step 1: Add `aria-pressed` to the two align buttons in the current component**

In `components/CardTemplateTab.tsx`, the `FieldChip` align buttons (currently distinguished only by class). Add `aria-pressed` reflecting the current align value — no class change:

```tsx
        {/* Align */}
        <button
          type="button"
          aria-label={`Align ${label} left`}
          aria-pressed={align === 'left'}
          onClick={() => onAlign('left')}
          className={`touch-manipulation text-[9px] font-bold rounded px-1 py-0.5 ${align === 'left' ? 'bg-orange-200 text-orange-800' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
        >
          ←L
        </button>
        <button
          type="button"
          aria-label={`Align ${label} right`}
          aria-pressed={align === 'right'}
          onClick={() => onAlign('right')}
          className={`touch-manipulation text-[9px] font-bold rounded px-1 py-0.5 ${align === 'right' ? 'bg-orange-200 text-orange-800' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
        >
          R→
        </button>
```

- [ ] **Step 2: Write the characterization spec**

Create `e2e/card-config-reskin-contract.spec.ts`. Three tests, each with its own `page.goto('/run-config')` so in-memory experiments never leak into the one persisted-save test:

```ts
import { test, expect } from '@playwright/test'

// Leader storageState (e2e/.auth/user.json) is the default project config.
// Characterization lock for epic #510 Story 5: the NBR reskin of the
// card-layout config screen must preserve every interactive control. Asserts
// behavior by accessible name — never Tailwind classes — so it survives the
// reskin (epic #510 testing rule).

async function openCardLayoutTab(page: import('@playwright/test').Page) {
  await page.goto('/run-config')
  await page.waitForLoadState('load')
  // Run Settings opens on "About the run"; the card editor is under "Card layout".
  await page.getByRole('button', { name: 'Card layout' }).click()
}

test.describe('card-layout config — interactive contract', () => {
  test('hidden bin: a field moves to Hidden and back', async ({ page }) => {
    await openCardLayoutTab(page)

    // "Description" ships in the upfront section (default template). Its chip
    // exposes a "Move Description to hidden" control.
    await page.getByRole('button', { name: 'Move Description to hidden' }).click()

    // It now lives in the Hidden bin, which exposes the inverse controls.
    const backToUpfront = page.getByRole('button', { name: 'Move Description to Show upfront' })
    await expect(backToUpfront).toBeVisible()

    // Move it back — the hidden-bin control is wired.
    await backToUpfront.click()
    await expect(page.getByRole('button', { name: 'Move Description to hidden' })).toBeVisible()
  })

  test('row move controls: edges disabled, middle enabled and wired', async ({ page }) => {
    await openCardLayoutTab(page)

    // Row 1 up is disabled (top edge); a middle row's up is enabled.
    await expect(page.getByRole('button', { name: 'Move row 1 up in Show upfront' })).toBeDisabled()
    const row2up = page.getByRole('button', { name: 'Move row 2 up in Show upfront' })
    await expect(row2up).toBeEnabled()

    // Clicking it reorders without crashing; row labels renumber so the
    // control set is still present afterward (the editor stayed mounted/wired).
    await row2up.click()
    await expect(page.getByRole('button', { name: 'Move row 1 up in Show upfront' })).toBeDisabled()

    // Split: "Distance & elevation" shares a row with others in the default
    // template, so its split control is a real (non-no-op) operation.
    await expect(
      page.getByRole('button', { name: 'Split Distance & elevation to its own row' }),
    ).toBeEnabled()
  })

  test('alignment toggle persists across save + reload', async ({ page }) => {
    await openCardLayoutTab(page)

    // "Author" is a lone-field row in the default template — toggling its
    // alignment never reorders rows, so the save round-trips to an identical
    // template once restored. aria-pressed is the class-free observable.
    const leftBtn = page.getByRole('button', { name: 'Align Author left' })
    const rightBtn = page.getByRole('button', { name: 'Align Author right' })

    const startedLeft = (await leftBtn.getAttribute('aria-pressed')) === 'true'
    const target = startedLeft ? rightBtn : leftBtn
    const targetName = startedLeft ? 'Align Author right' : 'Align Author left'

    await target.click()
    await expect(page.getByRole('button', { name: targetName })).toHaveAttribute('aria-pressed', 'true')

    await page.getByRole('button', { name: /save card layout/i }).click()
    await expect(page.getByRole('button', { name: /saved!/i })).toBeVisible()

    // Reload lands on the About tab — reopen Card layout and confirm the edit
    // survived the DB round-trip.
    await page.reload()
    await page.waitForLoadState('load')
    await page.getByRole('button', { name: 'Card layout' }).click()
    await expect(page.getByRole('button', { name: targetName })).toHaveAttribute('aria-pressed', 'true')

    // Restore the original alignment and save so the serial suite is untouched.
    const restoreName = startedLeft ? 'Align Author left' : 'Align Author right'
    await page.getByRole('button', { name: restoreName }).click()
    await page.getByRole('button', { name: /save card layout/i }).click()
    await expect(page.getByRole('button', { name: /saved!/i })).toBeVisible()
  })

  test('live preview: picker and surface tabs are wired', async ({ page }) => {
    await openCardLayoutTab(page)

    const emptyState = page.getByText('Add a workout to your library to preview')
    if (await emptyState.isVisible().catch(() => false)) {
      // No library workouts seeded for this run — nothing to drive. The
      // empty-state copy itself is the contract in that case.
      return
    }

    // Picker opens.
    const picker = page.getByRole('button', { name: 'Choose a workout to preview' })
    await picker.click()
    await expect(picker).toHaveAttribute('aria-expanded', 'true')
    // Close it (click again) before driving surface tabs.
    await picker.click()

    // Surface tabs switch the preview frame — "Schedule" shows "Currently planned".
    await page.getByRole('button', { name: 'Schedule', exact: true }).click()
    await expect(page.getByText('Currently planned')).toBeVisible()
    await page.getByRole('button', { name: 'My Plan', exact: true }).click()
    await expect(page.getByText('Currently planned')).toHaveCount(0)
  })
})
```

- [ ] **Step 3: Run the new spec — verify it PASSES on the current component**

Run: `npx playwright test e2e/card-config-reskin-contract.spec.ts`
Expected: all 4 tests PASS (this is a characterization lock, not red-first TDD — it pins existing behavior).
If a test fails, the assumption about current behavior is wrong — fix the test to match reality (not the component), since this task must not change behavior.

- [ ] **Step 4: Run tsc + unit tests — confirm the aria-pressed edit broke nothing**

Run: `npx tsc --noEmit && npm run test:unit`
Expected: both green.

- [ ] **Step 5: Commit**

```bash
git add components/CardTemplateTab.tsx e2e/card-config-reskin-contract.spec.ts
git commit -m "test(#515): lock card-layout config contract + aria-pressed on align toggle"
```

---

### Task 2: Reskin `CardTemplateTab` to NBR

Restyle the three section editors, row headers/move controls, field chips, Save button, and hints to the NBR monochrome/square/Jost language. Preserve every handler, `aria-label`, and the `aria-pressed` added in Task 1. No behavior change — the Task 1 lock stays green.

**Files:**
- Modify: `components/CardTemplateTab.tsx` (all JSX class strings; keep structure, handlers, props)

**Interfaces:**
- Consumes: `lib/cardStyles.ts` exports — may import `SQUARE_LABEL_BASE`, `OUTLINE_BTN`, `NEXT_UP_LABEL` where they fit; and `@theme` tokens `text-ink`/`text-muted`/`border-line`/`bg-surface`/`bg-card`/`bg-ink`/`font-display`.
- Produces: the reskinned tab; same exported default component signature (`CardTemplateTab({ runConfig, variants, nextEntry })`).

- [ ] **Step 1: Reskin the section containers and titles**

The three sections currently use colored tints (`bg-emerald-50 border-emerald-200`, `bg-blue-50 border-blue-200`, `bg-gray-50 border-gray-200`) and `rounded-xl`. Flatten to a single monochrome panel style and make titles Jost-uppercase ink. Replace the `●/◐/○` colored glyphs — keep them as plain ink glyphs (they are decorative section markers; the text label is the accessible content). Container → `border border-line bg-surface p-3 flex flex-col gap-2` (no radius). Title → `font-display uppercase tracking-[0.14em] text-[10px] font-medium text-ink`. Empty-section copy → `text-[11px] text-muted italic px-1`.

Apply to both `SectionRows` call sites (upfront, expanded) and the inline Hidden section. The `containerCls`/`titleCls`/`emptyMsg` props make this a prop-value change at the two call sites plus the inline Hidden block.

- [ ] **Step 2: Reskin the row card + row-move controls**

Per-row card: `bg-white border border-gray-200 rounded-lg` → `bg-card border border-line` (square). Row header strip: `bg-gray-50 border-b border-gray-100` → `bg-surface border-b border-line`. "Row N" label: → `font-display uppercase tracking-[0.1em] text-[9px] font-medium text-muted`. The ↑ ↓ and "⤒ Merge up" buttons: keep glyphs/text and all `aria-label`s and `disabled` logic; restyle to `text-muted disabled:opacity-30 active:text-ink` (drop `hover:text-gray-700`; `active:` is the mobile-correct state). Keep `touch-manipulation`.

- [ ] **Step 3: Reskin `FieldChip`**

Chip container: drop the emerald/blue tint (`chipCls`) and `rounded-lg` → `inline-flex flex-col gap-0.5 border border-line bg-surface px-2 py-1` (monochrome; the `chipColor` prop may be removed if no longer needed, OR kept and ignored — simpler to keep the prop to avoid touching `SectionRows`, but drop its only use). Label → `font-display text-[11px] font-medium text-ink whitespace-nowrap`. The control buttons (`● up`, `◐ exp`, `○ hide`, `←L`, `R→`, `⬡ split`): keep glyphs, text, `aria-label`, `aria-pressed`, handlers; restyle to monochrome — inactive `border border-line text-muted active:bg-surface`, and the align **active** state (`aria-pressed` true) → `bg-ink text-white` instead of `bg-orange-200 text-orange-800`. Keep `touch-manipulation` on all.

- [ ] **Step 4: Reskin `HiddenChip`**

Same treatment as `FieldChip`'s container/label/buttons: `border border-line bg-surface` (square), label `font-display text-[11px] font-medium text-muted`, the two move buttons monochrome `border border-line text-muted active:bg-surface`. Keep both `aria-label`s and handlers.

- [ ] **Step 5: Reskin the hint + Save button**

Hint copy (`Changes show on your Library cards after you Save.`): → `text-[11px] text-muted text-center`. Error text: `text-red-600` → keep a red error is acceptable (error semantics, not brand decoration) — but prefer `text-ink` on a `border border-ink` treatment is overkill; keep `text-sm text-red-600` for the error (semantic, not reskinnable to monochrome without losing the "this is an error" signal — note this as the one intentional non-monochrome element and confirm at Preview). Save button: `bg-orange-600 text-white rounded-xl py-3 font-bold text-sm` → an ink-filled square CTA: `bg-ink text-white py-3 font-display uppercase tracking-[0.1em] text-[11px] font-medium disabled:opacity-50 touch-manipulation`. Keep the `Saved! / Saving… / Save card layout` label logic verbatim.

- [ ] **Step 6: Run the lock + tsc + unit — confirm green through the reskin**

Run: `npx playwright test e2e/card-config-reskin-contract.spec.ts && npx tsc --noEmit && npm run test:unit`
Expected: all green (behavior unchanged; the lock now asserts the active align state via `aria-pressed`, not the orange class).

- [ ] **Step 7: Commit**

```bash
git add components/CardTemplateTab.tsx
git commit -m "feat(#515): reskin card-layout config editor to NBR (monochrome, square, Jost)"
```

---

### Task 3: Reskin `CardLayoutPreview` chrome to NBR

Restyle the picklist, the workout-dropdown menu, the surface-tab picker, and the three surface frame headers + the frame container. The embedded `WorkoutCardBody` is already Story-2 reskinned — leave it. Preserve all handlers, `aria-label`, `aria-expanded`, and the click-outside logic.

**Files:**
- Modify: `components/CardLayoutPreview.tsx`

**Interfaces:**
- Consumes: `lib/cardStyles.ts` — import `filterChip` for the surface-tab picker (its exact `.k-chip` semantics: square, uppercase Jost, ink-filled when active); tokens `text-ink`/`text-muted`/`border-line`/`bg-card`/`bg-surface`.
- Produces: reskinned preview; same component signature and `Surface` behavior.

- [ ] **Step 1: Reskin the picklist trigger + dropdown menu**

Trigger button (`border border-gray-200 rounded-lg bg-white … text-gray-900`): → `border border-line bg-card px-3 py-2.5 text-sm text-ink` (square). The placeholder span `text-gray-400` → `text-muted`. Keep `aria-label="Choose a workout to preview"` and `aria-expanded`. Dropdown panel (`border-gray-200 rounded-lg shadow-lg`): → `border border-line bg-card shadow-lg` (square; shadow allowed — it's a floating menu, not a brand surface). The "Preview with…" header (`text-gray-400 bg-gray-50`): → `font-display uppercase tracking-[0.1em] text-[10px] font-medium text-muted bg-surface`. Menu items `border-gray-100 hover:bg-orange-50`: → `border-t border-line active:bg-surface`; subtitle `text-gray-400` → `text-muted`.

- [ ] **Step 2: Reskin the surface-tab picker with `filterChip`**

Replace the inline orange/gray tab class string with the shared `filterChip(active)` helper so it matches the browse-screen chips exactly:

```tsx
import { filterChip } from '@/lib/cardStyles'
// …
<div className="flex gap-1.5">
  {(['myplan', 'schedule', 'library'] as Surface[]).map(s => {
    const label = s === 'myplan' ? 'My Plan' : s === 'schedule' ? 'Schedule' : 'Library'
    return (
      <button
        key={s}
        type="button"
        onClick={() => { setSurface(s); setExpanded(false) }}
        className={`flex-1 text-center ${filterChip(surface === s)}`}
      >
        {label}
      </button>
    )
  })}
</div>
```

- [ ] **Step 3: Reskin the frame container + the three surface headers**

Frame container (`rounded-2xl shadow-sm border border-line bg-card`): → `border border-line bg-card` (drop radius + shadow; brand cards are flat square). My Plan header: run-identity line `text-accent font-bold tracking-wide` → `font-display uppercase tracking-[0.1em] text-[11px] font-medium text-ink`; date `text-muted` keep; name `font-bold text-ink` → `font-display font-normal text-ink` (title-case headline); the type pill `rounded-full bg-rose-50 border-rose-200 text-rose-800` → the shared square label `border border-line text-muted` with `font-display uppercase tracking-[0.1em] text-[10px] px-2 py-1`. Schedule header: "Currently planned" `font-bold text-ink` → `font-display uppercase tracking-[0.12em] text-[11px] font-medium text-ink`; keep the name/date/label in ink/muted. Library header: the type pill `rounded-full bg-surface text-muted border border-line` → square `border border-line text-muted` same label treatment. Keep all text content verbatim (the lock asserts "Currently planned").

- [ ] **Step 4: Reskin the caption**

Caption (`text-[11px] text-muted text-center`) is already on-token — leave it. Confirm no stray `text-gray-*`/`rounded-*`/`*-orange-*`/`*-rose-*` remain:

Run: `rg -n "gray-|orange|rose|rounded|text-accent|bg-accent" components/CardLayoutPreview.tsx`
Expected: no matches (the embedded `WorkoutCardBody` is a separate file and is already reskinned).

- [ ] **Step 5: Run the lock + tsc + unit**

Run: `npx playwright test e2e/card-config-reskin-contract.spec.ts && npx tsc --noEmit && npm run test:unit`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add components/CardLayoutPreview.tsx
git commit -m "feat(#515): reskin card-layout live preview chrome to NBR"
```

---

### Task 4: Full verification + Preview deploy

**Files:** none (verification only).

- [ ] **Step 1: Full suite + typecheck**

Run: `npx tsc --noEmit && npm run test:unit && npx playwright test e2e/card-config-reskin-contract.spec.ts e2e/run-config.spec.ts e2e/card-reskin-contract.spec.ts`
Expected: all green — the config tab's neighbors (run-config, card contract) are unaffected.

- [ ] **Step 2: Grep for off-brand residue across both files**

Run: `rg -n "emerald|blue-|gray-|orange|rose|rounded-(sm|md|lg|xl|2xl|full)|text-accent|bg-accent" components/CardTemplateTab.tsx components/CardLayoutPreview.tsx`
Expected: no matches. (Bare `rounded` with no radius suffix, if any, is acceptable — inspect any hit.)

- [ ] **Step 3: Open the PR and run the Preview check**

Push the branch, open the PR (Design + AC + Test plan/Manual steps sections per CLAUDE.md). On the Preview URL, sign in as the test leader, open Run Settings → Card layout, and verify against the prototype `#config`: monochrome panels, square corners, Jost uppercase section/row/chip labels, ink-filled Save, `filterChip` surface tabs, and the live preview renders the Story-2 card. Confirm the one intentional non-monochrome element (the red error text) only appears on an actual save error. This is the only check that proves it *looks* right — tsc/unit/e2e prove only that nothing behavioral broke.

## Notes / open questions for Lou

- **`--color-accent` token removal** (globals.css:17, "removed in final story"): intentionally deferred — still used by ~8 out-of-scope components. Flag as a follow-up cleanup story; not done here.
- **Red error text** kept on the Save error path as the one non-monochrome element (error semantics). Raise at Preview if you'd rather it go ink + border.
