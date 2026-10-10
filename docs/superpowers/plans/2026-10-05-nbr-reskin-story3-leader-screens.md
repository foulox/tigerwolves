# NBR reskin — Story 3: leader screens (Schedule + My Plan) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the two leader write-surfaces — Schedule and My Plan — onto the NBR design system, reusing the vocabulary Stories 2a/2b shipped, without changing a single capability.

**Architecture:** A recolor of the screen-specific components only: `ScheduleClient` + `LeaderPicker` (Schedule), `MyPlanClient` + `MyPlanCard` (My Plan). The shared workout sub-components these screens render (WorkoutDetails, ReactionPicker, WorkoutFlagSheet/FlagBadge, AdoptRouteControls, RatingFilter) are recolored by **Story 2b** and are **off-limits here** — Story 3 builds on a `redesign/nbr` that already has 2b merged, so those render correctly without being touched. This is the **highest capability-drift risk** story: Schedule is a dense write surface (server-action save, verify-gated clipboard copy, inline post editor, week-nav filter reset). The recolor touches **colors only** — never logic, state, handlers, or structure.

**Tech Stack:** Next.js 16 (App Router), Tailwind CSS v4 (`@theme` semantic utilities), TypeScript, vitest (source-assertion tests), Playwright (e2e capability gate + visual check).

**Spec:** `docs/superpowers/specs/2026-10-04-nbr-reskin-design.md` (published in epic #466 `## Design`).

**Branch:** builds on `redesign/nbr` (Stories 1 + 2a + 2b landed there). **Build prerequisite: 2b must be merged into `redesign/nbr` first** — otherwise the shared sub-components rendered inside Schedule/My Plan are still un-recolored and the screens look half-done. Build on a story branch off `redesign/nbr` (e.g. `story/489-leader-screens`), PR into `redesign/nbr`.

## Global Constraints

- **Reskin only — preserve 100% of capabilities.** The full e2e suite must stay green, **every spec byte-for-byte unchanged**. Unlike 2b, **no test edit is needed** — `schedule.spec.ts` and `my-plan.spec.ts` select only by role / text / `data-testid`, never by a color class (verified). If any spec needs an edit to pass, a recolor changed behavior — stop and revert.
- **Reuse the shipped vocabulary verbatim:** cards → `bg-card`; page/section → `bg-surface`; borders → `border-line`; body text → `text-ink`; secondary → `text-muted`; primary actions + active/selected states → `bg-accent text-white` / `border-accent` / `text-accent` (+ `ring-accent` for selection rings, `accent-accent` for native checkbox accent-color); **neutral non-semantic pill** → `bg-surface text-muted border border-line`.
- **ORANGE IS NOT A STATE COLOR.** It is the old brand color — **every** `orange-*` (50/100/200/300/400/500/600, bg/text/border/ring, including `bg-orange-50` section tints, `text-orange-500` kickers, `border-orange-400` selection, `accent-orange-600` checkboxes) maps to the **accent** family (primary/active/selected/kicker/hint) or, for classification badges, to the **neutral pill**. Do not "keep" any orange.
- **The ONLY semantic STATE colors kept are RED and GREEN:** red error/flagged (`bg-red-50/100`, `border-red-200`, `text-red-600/700/800`) stays; the green save-success confirmation (`bg-green-500`) stays. Nothing else is kept.
- **Collapse classification color-coding to the neutral pill:** `TYPE_COLORS` (Hills/Tempo/… in MyPlanCard) and the family "N versions" badge (`bg-orange-100 text-orange-600`) → the neutral pill. Labels stay.
- **DO NOT TOUCH the shared sub-components** (Story 2b owns them): `WorkoutDetails.tsx`, `ReactionPicker.tsx`, `WorkoutFlagSheet.tsx` (FlagBadge/FlagGhostButton/FlagWorkoutDrawer), `AdoptRouteControls.tsx`, `RatingFilter.tsx`. Story 3 edits only `ScheduleClient.tsx`, `LeaderPicker.tsx`, `MyPlanClient.tsx`, `MyPlanCard.tsx`.
- **Preserve every `data-testid`, `aria`/role, button text, `href`, and ALL behavior.** Colors only.
- **No new hardcoded hex.**

## Review Focus

- **The Schedule write path must be untouched** — `setPlanWorkout` server-action save (the "Set as plan" button's submit + enabled/disabled gating), the verify-checkbox-gated `navigator.clipboard.writeText` copy flow, the inline post `<textarea>` (auto-grow via the ref callback, local-only edit state, clear-on-regenerate effect), the week-nav filter/selection **reset**, the scope-toggle reset, and the family multi-select model (≤2 within a family, single across families). A recolor that edits any of these is a capability change. (Task 1 — schedule e2e gate.)
- **A shared sub-component gets recolored here by mistake** → duplicates/conflicts with 2b. Story 3 touches only the four screen-specific files. (Tasks 1-2 — `git diff --name-only` must list only those.)
- **Orange left un-mapped** (from the mislabeled "keep" classification) → the screen still reads as the old brand. Source tests assert no `orange-*` survives. (Tasks 1-2.)
- **A `data-testid` on a Schedule/My-Plan element changes** → breaks the e2e. e.g. `my-plan-card-*`, `my-plan-type-*`, `my-plan-set-*`, `my-plan-route-*`, `my-plan-run-link-*`, `week-range-label`, `week-next/prev`, `day-group-*`, `my-plan-empty`. (Tasks 1-2.)
- **Full-suite green** — confirms the recolor didn't disturb the shared components or any other screen. (Task 3.)

---

### Task 1: Recolor Schedule (ScheduleClient + LeaderPicker)

The biggest, densest component in the reskin (~867 LOC) and a live write surface. **Colors only.**

**Files:**
- Modify: `components/ScheduleClient.tsx`, `components/LeaderPicker.tsx`
- Test: `__tests__/scheduleReskin.test.ts`

**Mapping (apply every occurrence of each pattern):**

| Current pattern | → New | Notes |
|---|---|---|
| `bg-orange-500 text-white` / `bg-orange-600` (active type chips, copy button, save-active) | `bg-accent text-white` | primary actions |
| `bg-gray-900 text-white` (active toggle/filter/button) | `bg-accent text-white` | active state |
| inactive pills `bg-white border border-gray-200 text-gray-600` | `bg-card border border-line text-muted` | inactive filters/toggles |
| `bg-orange-50 border-orange-200` (WORKOUT TYPE section) | `bg-surface border-line` | section → neutral; kicker carries accent |
| `text-orange-500` (kickers: "WORKOUT TYPE", variation labels) | `text-accent` | section kicker accent |
| `text-orange-600` (hints, "tap to change", "N versions", "✎ editable", links) | `text-accent` | accent text |
| `bg-orange-100 text-orange-600` (version badge) | `bg-surface text-muted border border-line` | classification → neutral |
| selection `border-orange-400 ring-1 ring-orange-300` | `border-accent ring-1 ring-accent` | selected card |
| radio `border-orange-500 bg-orange-500` / unselected `border-gray-300` | `border-accent bg-accent` / `border-line` | variant radio |
| selected variant row `bg-orange-50` | `bg-surface` | selection shown by radio/border |
| tab container `bg-gray-100`; verify section `bg-gray-50`; nav/picker cards `bg-white` | `bg-surface`; `bg-surface`; `bg-card` | containers |
| borders `border-gray-100` / `border-gray-200` / `border-b border-gray-50` | `border-line` | all neutral borders |
| search `border-gray-200 focus:border-orange-400`; textarea `border-gray-200 focus:border-orange-500 focus:ring-orange-200` | `border-line focus:border-accent`; `border-line focus:border-accent focus:ring-accent` | inputs |
| post textarea bg `bg-[#fffdf9]` | `bg-card` | editor bg |
| checkbox `accent-orange-600` | `accent-accent` | native checkbox color |
| text `text-gray-900` / `text-gray-700` / `text-gray-600`,`text-gray-500`,`text-gray-400` | `text-ink` / `text-ink` / `text-muted` | copy |
| **KEEP (state):** error `bg-red-50 border-red-200 text-red-700`, "Needs leader" `text-red-600`; save-success `bg-green-500` | unchanged | red + green only |

- [ ] **Step 1: failing source test**

```ts
// __tests__/scheduleReskin.test.ts
import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
const read = (p: string) => readFileSync(path.resolve(__dirname, '..', p), 'utf8')
const sc = read('components/ScheduleClient.tsx')
const lp = read('components/LeaderPicker.tsx')
describe('Schedule reskin (#489)', () => {
  test('NBR tokens + accent present', () => {
    for (const t of ['bg-card', 'bg-surface', 'border-line', 'text-ink', 'text-muted', 'bg-accent', 'text-accent']) expect(sc).toContain(t)
  })
  test('no orange survives anywhere (brand → accent/neutral)', () => {
    expect(sc).not.toMatch(/orange-\d/)
    expect(lp).not.toMatch(/orange-\d/)
    expect(sc).not.toContain('bg-gray-900')
  })
  test('state colors kept: red error + green save-success', () => {
    expect(sc).toContain('bg-red-50'); expect(sc).toContain('bg-green-500')
  })
})
```

- [ ] **Step 2: fails** → `npx vitest run __tests__/scheduleReskin.test.ts`.
- [ ] **Step 3: apply mapping** — colors only. Do NOT touch: `setPlanWorkout` call + the save button's gating, the copy/verify flow, the textarea ref/edit/regenerate logic, `changeWeek`/`setScope` resets, the selection model, or any `data-testid`/text.
- [ ] **Step 4: pass + tsc** → `npx vitest run __tests__/scheduleReskin.test.ts`; `npx tsc --noEmit`.
- [ ] **Step 5: capability gate** → `npm run test:e2e -- schedule.spec.ts` → PASS, **spec unedited**.
- [ ] **Step 6: commit**

```bash
git add components/ScheduleClient.tsx components/LeaderPicker.tsx __tests__/scheduleReskin.test.ts
git commit -m "feat(#489): recolor Schedule onto NBR tokens (write surfaces untouched)"
```

---

### Task 2: Recolor My Plan (MyPlanClient + MyPlanCard)

**Files:**
- Modify: `components/MyPlanClient.tsx`, `components/MyPlanCard.tsx`
- Test: `__tests__/myPlanReskin.test.ts`

**Mapping:**

| Current | → New | Element |
|---|---|---|
| today's date cell `bg-orange-500 text-white` | `bg-accent text-white` | today marker |
| non-today cells `text-gray-600`; week-range + "nothing scheduled" `text-gray-400` | `text-muted` | strip labels |
| card `bg-white border border-gray-100 rounded-2xl shadow-sm` | `bg-card border border-line rounded-2xl shadow-sm` | card frame |
| card press `active:bg-gray-50` | `active:bg-surface` | press feedback |
| run-name link + "View route ↗" `text-orange-600` | `text-accent` | links |
| date `text-gray-500`; name `text-gray-900`; "Not planned yet" `text-gray-400`; set/distance `text-gray-600`; "Led by" `text-gray-500` | `text-muted`; `text-ink`; `text-muted`; `text-muted`; `text-muted` | card text |
| `TYPE_COLORS` map (Hills green … Threshold pink, fallback gray) | one neutral pill `bg-surface text-muted border border-line` | type pill — **collapse** |
| detail divider `border-t border-gray-100` | `border-t border-line` | expander |
| **KEEP (state):** flagged badge `bg-red-100 text-red-800` | unchanged | flagged |

- [ ] **Step 1: failing source test**

```ts
// __tests__/myPlanReskin.test.ts
import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
const read = (p: string) => readFileSync(path.resolve(__dirname, '..', p), 'utf8')
const cl = read('components/MyPlanClient.tsx'); const cd = read('components/MyPlanCard.tsx')
describe('My Plan reskin (#489)', () => {
  test('NBR tokens + accent present; no orange; type pills collapsed', () => {
    for (const t of ['bg-card', 'border-line', 'text-ink', 'text-muted', 'text-accent']) expect(cd).toContain(t)
    expect(cl).toContain('bg-accent') // today marker
    expect(cl).not.toMatch(/orange-\d/); expect(cd).not.toMatch(/orange-\d/)
    for (const dead of ['bg-green-100', 'bg-blue-100', 'bg-purple-100', 'bg-pink-100', 'bg-yellow-100']) expect(cd).not.toContain(dead)
  })
  test('flagged state stays red', () => { expect(cd).toContain('bg-red-100') })
})
```

- [ ] **Step 2: fails**.
- [ ] **Step 3: apply mapping** — colors only; preserve card expand/collapse, the ReactionPicker/FlagWorkoutDrawer embeds (don't touch their internals), the run link, and every `data-testid` (`my-plan-card-*`, `my-plan-type-*`, `my-plan-set-*`, `my-plan-route-*`, `my-plan-run-link-*`, `week-range-label`, `week-next/prev`, `day-group-*`, `my-plan-empty`).
- [ ] **Step 4: pass + tsc**.
- [ ] **Step 5: capability gate** → `npm run test:e2e -- my-plan.spec.ts` → PASS, spec unedited.
- [ ] **Step 6: commit**

```bash
git add components/MyPlanClient.tsx components/MyPlanCard.tsx __tests__/myPlanReskin.test.ts
git commit -m "feat(#489): recolor My Plan onto NBR tokens (type pills → neutral)"
```

---

### Task 3: Full verification + visual

- [ ] **Step 1: full unit suite + typecheck** — `npx vitest run && npx tsc --noEmit` → PASS.
- [ ] **Step 2: FULL e2e suite** — `npm run test:e2e` → PASS with **every spec byte-for-byte unchanged** (`git diff e2e/` empty). Story 3 needs no test edits; a spec change = a behavior change, fix the component.
- [ ] **Step 3: shared-boundary check** — `git diff --name-only` must list only `components/ScheduleClient.tsx`, `components/LeaderPicker.tsx`, `components/MyPlanClient.tsx`, `components/MyPlanCard.tsx`, and the three new test files. If WorkoutDetails/ReactionPicker/WorkoutFlagSheet/AdoptRouteControls/RatingFilter appear, revert them — 2b owns them.
- [ ] **Step 4: visual check** — Playwright screenshots (signed-in leader via `.env.test`) of `/schedule` (both planned + unplanned weeks, the post-draft and change-workout tabs, the verify+copy flow) and `/my-plan`, vs the Option 1 palette: dark header over light surface; active/selected = accent; neutral pills; red errors + green save-confirmation still read as state; the post editor legible. Confirm the write flows still work live (pick a workout, generate post, verify, copy).
- [ ] **Step 5: record** — screenshots + "full suite green, no spec edits, only 4 component files touched" in the PR.

---

## Notes for the executor

- **No DB / migration. No new UI. Colors only.** This is the riskiest reskin story because Schedule is a live write surface — if a diff hunk changes anything other than a `className`/color, stop.
- **Build only after 2b is merged into `redesign/nbr`** — else the shared sub-components inside these screens are still old-colored.
- **The four files Story 3 owns** are `ScheduleClient`, `LeaderPicker`, `MyPlanClient`, `MyPlanCard`. Everything else workout-related is 2b's.
- **Zero test edits** — the leader-screen e2e selects by role/text/testid, so unlike 2b there is no selector to de-couple. Keep it that way.
- **Reuse the exact neutral-pill string** `bg-surface text-muted border border-line` so every collapsed pill matches the rest of the app.
