# NBR reskin — Story 2a: All Runs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the All Runs screen onto the NBR design system — a pure recolor of `components/AllRunsClient.tsx` onto the Story-1 `@theme` tokens, preserving every capability — and confirm it stays lovable at 24-run scale.

**Architecture:** All Runs already renders the shared dark NBR `Header` (restyled in Story 1) — so there is **no new hero to build**. The work is entirely in `components/AllRunsClient.tsx`: (1) substitute the structural/chrome/neutral colors and active states onto NBR semantic utilities, (2) collapse the two pieces of redundant color-coding the Option 1 design drops (AM/PM start-time colors, per-category pill colors), and (3) verify at 24 seeded runs. Semantic *state* colors (admin Live/Draft/Unclaimed, destructive red, pending blue) stay — they convey information, not brand.

**Tech Stack:** Next.js 16 (App Router), Tailwind CSS v4 (`@theme` semantic utilities from Story 1), TypeScript, vitest (source-assertion tests), Playwright (e2e capability gate + visual/scale check).

**Spec:** `docs/superpowers/specs/2026-10-04-nbr-reskin-design.md`

**Branch:** builds on the `redesign/nbr` integration branch (Story 1 landed there). Does not merge to `main` until all reskin stories are verified together.

## Global Constraints

- **Reskin only — preserve 100% of capabilities.** `e2e/all-runs.spec.ts` must stay green **unchanged**. If a recolor forces an e2e edit, that is a behavior change — stop and justify or revert.
- **No new hardcoded hex/color literals.** Use the Story-1 NBR semantic utilities only. The screen's brand colors must reference `@theme` tokens so a future tenant-config (#486) is a feed-the-vars step.
- **NBR semantic utilities (from Story 1 `globals.css`):** `bg-chrome` `text-chrome-text` `text-chrome-muted` (#0e0e0e / #fff / #9aa0a6 — dark chrome zone); `bg-surface` (#f6f6f6), `bg-card` (#fff), `border-line` (#e7e7e7), `text-ink` (#0e0e0e), `text-muted` (#4a5464), `text-accent` / `bg-accent` (#f0523d).
- **Accent is used sparingly** (spec): primary buttons, the active filter/chip state, the TODAY/NEXT marker, and the lead-day emphasis. Nothing else.
- **Semantic STATE colors stay** (they encode state, not brand): admin status badges Live=green / Draft=amber / Unclaimed=gray; the non-admin draft badge (amber); the destructive Remove control (red); the pending Setup control (blue). Do not recolor these to accent/neutral.
- **Every `data-testid` and visible text string is preserved** — the e2e asserts on testids and text (never on color), so recoloring and collapsing color-coding are safe *as long as testids/text are untouched*.
- **MLP, not MVP** — genuinely great at 24 runs, not merely recolored.

## Review Focus

- **A `data-testid` renamed/dropped during the recolor** → breaks `all-runs` e2e. The e2e depends on: `all-runs-intro`, `intro-schedule-link`, `intro-signup-link`, `intro-nudge`, `run-row`, `run-name`, `run-category-pill`, `time-filter-am/pm/wknd/all`, `category-chip-*`, `day-block-*`, `empty-day-state`, `following-tier`, `follow-toggle-*`, `following-run-*`, `leader-cta`, `add-your-run-btn`, and the admin control testids. (Tasks 1 & 2 — e2e gate.)
- **A semantic state color flattened to accent/neutral** → a leader loses the Live/Draft/Unclaimed signal, or Remove stops reading as destructive. These must survive the recolor. (Task 1 — source test asserts the state classes remain.)
- **The AM/PM meridiem *text* removed along with its color** → `all-runs.spec.ts` lines 45-46/54-56 assert the time string still contains/omits "am"/"pm". Collapse the *color* only; the time text stays. (Task 2 — e2e gate.)
- **A run disappears from a category section/chip after the pill recolor** → the category *label* and the grouping logic must be untouched; only the pill's color collapses. `run-category-pill` still reads its category text (e2e line 75 asserts `toHaveText('Workouts')`). (Task 2 — e2e gate.)
- **24-run scale** — the hero + long category list + filters must stay usable and lovable at real NBR scale, not just the 3-run mockup. (Task 3 — seeded scale + visual check.)

---

### Task 1: Recolor AllRunsClient onto NBR tokens (chrome / surface / neutral / active states)

Pure mechanical substitution. This task does **not** touch the AM/PM time colors or the per-category pill colors (those are Task 2) and **keeps** the semantic state colors. After this task, All Runs reads as NBR except the two color-codings Task 2 collapses.

**Files:**
- Modify: `components/AllRunsClient.tsx`
- Test: `__tests__/allRunsReskin.test.ts` (source assertions)

**Interfaces:**
- Consumes: the NBR semantic utilities from Story 1 (`bg-chrome`, `bg-card`, `border-line`, `text-ink`, `text-muted`, `text-accent`/`bg-accent`).
- Produces: nothing other tasks import (component-internal recolor).

**The mapping (apply every occurrence):**

| Current (verbatim) | → New | UI context (line refs, pre-edit) |
|---|---|---|
| `bg-white` | `bg-card` | following card 257, run card 447, inactive time filter 307, inactive category chip 328 |
| `border-[#f1f2f5]`, `border-[#e8eaef]`, `border-gray-200`, `border-gray-100`, `border-[#d7dbe3]` | `border-line` | run card 448 (non-lead), chip borders 307/328, day-header rule 361, admin-controls top border 482, leader CTA 560 |
| `bg-[#e8eaef]` (day-header rule fill) | `bg-line` | 361 |
| `text-gray-900`, `text-[#111827]` (as text) | `text-ink` | following card name 260, leader-CTA heading 563 |
| `text-[#8b93a1]`, `text-[#4b5568]`, `text-gray-400`, `text-[#a7adb8]`, `text-[#c7ccd6]` | `text-muted` | meta/location/distance 414, day-header non-lead 355, date 360, chevron 465, following meta 261, standfirst 291, intro body/nudge 222/227/234, leader-CTA desc 564, inactive chip/filter text 307/328 |
| `bg-[#111827] text-white` (dark primary buttons) | `bg-accent text-white` | admin add-run 283, leader-CTA "Add your run" 569 |
| `bg-orange-500 text-white` (primary CTAs) | `bg-accent text-white` | run-card "+ Join" 436, intro "See TigerWolves schedule" 216 |
| active category chip `bg-[#111827] text-white border-[#111827]` | `bg-accent text-white border-accent` | 327 |
| active time filter `bg-[#ffedd5] text-[#c2410c] border-[#fdba74]` | `bg-accent text-white border-accent` | 306 |
| day-header lead text `text-[#f97316]` (Today/Tomorrow) | `text-accent` | 355 |
| lead-day run-card border `border-[#fdba74]` | `border-accent` | 448 |
| intro box `bg-[#fff7ed]` + `border-[#fdba74]` | `bg-card` + `border-line` | 211 |
| intro emphasis `text-[#c2410c]` | `text-accent` | 223, 240 |
| orange-tinted shadows `shadow-[0_1px_3px_rgba(249,115,22,0.08)]`, run-card `shadow-[0_1px_3px_rgba(17,24,39,0.04)]` | `shadow-sm` | 211, 447 |
| leader-CTA heading `text-[#111827]` | `text-ink` | 563 |
| admin Edit/Manage controls `text-gray-600 bg-gray-100` + `hover:bg-gray-200` | `text-muted bg-surface hover:bg-line` | 503, 514 |

**KEEP unchanged in this task (do NOT touch):**
- AM/PM start-time colors `text-[#f97316]` / `text-[#6366f1]` (line 383) — Task 2.
- The `CATEGORY_PILL` map (lines 45-51, per-category colors) — Task 2.
- Semantic STATE colors: admin status badges `bg-green-100 text-green-800 border-green-200` (Live), `bg-amber-100 text-amber-800 border-amber-200` (Draft), `bg-gray-100 text-gray-500 border-gray-200` (Unclaimed) (404/406/407); the non-admin draft badge (452); "Joined" state `bg-green-100 text-green-800` (268/435 → see note); the pending Setup control `text-blue-700 bg-blue-50 hover:bg-blue-100` (527); the destructive Remove control `text-red-600 bg-red-50 hover:bg-red-100` (543); the following-tier card border `border-green-200` (257).
- **"Joined" vs "+ Join" decision:** "+ Join" is the primary CTA → `bg-accent text-white` (recolored above). "Joined" is a done-state confirmation — recolor it to a neutral pill `bg-surface text-muted border border-line` (it is *not* a semantic state badge like Live/Draft; it mirrors the button and the text "Joined" already conveys state). Apply to both 268 (following tier) and 435 (run card).
- All `data-testid`, `aria-label`, `href`, `data-tour`, and text strings.

- [ ] **Step 1: Write the failing source-assertion test**

```ts
// __tests__/allRunsReskin.test.ts
import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
const src = readFileSync(path.resolve(__dirname, '../components/AllRunsClient.tsx'), 'utf8')

describe('All Runs reskin — chrome/surface/neutral/active (#488)', () => {
  test('uses NBR semantic utilities for structure', () => {
    expect(src).toContain('bg-card')
    expect(src).toContain('border-line')
    expect(src).toContain('text-ink')
    expect(src).toContain('text-muted')
  })
  test('primary actions + active states use accent', () => {
    expect(src).toContain('bg-accent')
    expect(src).toContain('border-accent')
    expect(src).toContain('text-accent')
  })
  test('the recolored neutral/chrome literals are gone', () => {
    for (const dead of ['#fff7ed', '#fdba74', '#ffedd5', '#c2410c', '#111827', '#8b93a1', '#4b5568', '#a7adb8', '#c7ccd6', '#f1f2f5', '#e8eaef', '#d7dbe3', 'bg-orange-500']) {
      expect(src).not.toContain(dead)
    }
  })
  test('semantic STATE colors are preserved', () => {
    expect(src).toContain('bg-green-100') // Live / following-section affordance
    expect(src).toContain('bg-amber-100') // Draft
    expect(src).toContain('bg-red-50')    // destructive Remove
    expect(src).toContain('bg-blue-50')   // pending Setup
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/allRunsReskin.test.ts`
Expected: FAIL — the dead literals are still present.

- [ ] **Step 3: Apply the mapping** in `components/AllRunsClient.tsx` exactly as the table above. Work region by region (intro box, following tier, time-filter row, category-chip row, day headers, run cards, join buttons, admin controls, leader CTA). Change only color classes — never a `data-testid`, `href`, `aria-label`, `data-tour`, or text string.

- [ ] **Step 4: Run to verify it passes + typecheck**

Run: `npx vitest run __tests__/allRunsReskin.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Capability gate — the all-runs e2e, unedited**

Run: `npm run test:e2e -- all-runs.spec.ts`
Expected: PASS, with **no edits** to the spec. (The controller owns running this if env-blocked; it is the gate.)

- [ ] **Step 6: Commit**

```bash
git add components/AllRunsClient.tsx __tests__/allRunsReskin.test.ts
git commit -m "feat(#488): recolor All Runs onto NBR tokens (chrome/surface/active states)"
```

---

### Task 2: Collapse the two color-codings (AM/PM time colors, per-category pill colors)

The Option 1 design drops redundant color-coding: times are one color, filter/category pills are one neutral style with an accent-active state. The information survives as **text** (the time still says am/pm; the pill still shows its category label). This is the one information-adjacent change — reviewed carefully against the unchanged e2e.

**Files:**
- Modify: `components/AllRunsClient.tsx`
- Test: extend `__tests__/allRunsReskin.test.ts`

- [ ] **Step 1: Add the failing assertions**

```ts
// append to __tests__/allRunsReskin.test.ts
describe('All Runs reskin — color-coding collapsed (#488)', () => {
  test('AM/PM start-time colors are gone (uniform time color)', () => {
    expect(src).not.toContain('#f97316') // AM orange
    expect(src).not.toContain('#6366f1') // PM indigo
  })
  test('per-category pill colors collapsed to one neutral style', () => {
    // the CATEGORY_PILL map no longer carries per-category Tailwind color pairs
    for (const dead of ['bg-sky-100', 'text-sky-800', 'bg-purple-100', 'text-purple-800', 'bg-blue-100 text-blue-800']) {
      expect(src).not.toContain(dead)
    }
  })
})
```

Note: re-read `src` at top of file already covers these (same import). Expected: FAIL initially.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/allRunsReskin.test.ts`
Expected: FAIL — AM/PM hex + per-category pill colors still present.

- [ ] **Step 3: Collapse the two codings**

- **AM/PM start time** (line ~383): the time element currently switches `text-[#f97316]` (AM) / `text-[#6366f1]` (PM). Replace with a single uniform `text-ink` (keeps the time prominent/legible on the card; drops the meridiem *color* only). **Keep the time string exactly** — the "am"/"pm" text stays (e2e depends on it).
- **Category pills** (`CATEGORY_PILL` map, lines ~45-51): replace the five per-category color pairs with one shared neutral style for every category: `'bg-surface text-muted border border-line'`. The category **label** (the pill's text, driven by `card.category`) is unchanged — only the color collapses. `run-category-pill` testid and its text stay.

- [ ] **Step 4: Run to verify it passes + typecheck**

Run: `npx vitest run __tests__/allRunsReskin.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Capability gate — all-runs e2e, unedited**

Run: `npm run test:e2e -- all-runs.spec.ts`
Expected: PASS, spec unedited. Specifically confirms the AM/PM time-text assertions (lines 45-46/54-56) and the category-pill text assertion (line 75) still hold after the color collapse.

- [ ] **Step 6: Commit**

```bash
git add components/AllRunsClient.tsx __tests__/allRunsReskin.test.ts
git commit -m "feat(#488): collapse All Runs color-coding (AM/PM, category pills) per Option 1"
```

---

### Task 3: 24-run scale + visual verification

The spec's top risk: lovable at real NBR scale, not the 3-run mockup. This task is a verification deliverable — no production code unless it surfaces a defect.

**Files:**
- Possibly modify: `scripts/seed-e2e.ts` (only if more seeded runs are needed to reach ~24 across categories) — or a throwaway seed for local visual check.
- No production-code change expected.

- [ ] **Step 1: Confirm/extend seed to ~24 runs across categories**

Check how many runs `scripts/seed-e2e.ts` currently seeds (Story-1 run showed 4 runs seeded). For the scale check, seed ~24 runs spread across all five NBR categories and across days/times (AM + PM + weekend), so every category section, both time filters, and the chip row are exercised at scale. If extending `seed-e2e.ts`, keep it idempotent and host-guarded (it already refuses any host but the test-data branch). If a permanent 24-run fixture would bloat the e2e baseline, use a throwaway local seed instead and note it.

- [ ] **Step 2: Playwright visual pass at 24 runs**

Write a throwaway Playwright script (Chromium is installed locally; `@playwright/test` is a devDependency) that, against the dev server on the `test-data` branch, loads `/all-runs` both logged-out and signed in as the test leader (`.env.test` creds), and captures full-page screenshots. Verify, against `docs/superpowers/specs/assets/tenant-config/option1-screens-v14.html`:
- dark NBR header (logo) over a light `bg-surface` body;
- category sections + the chip row + time filters all legible and scrollable at 24 runs, active state = accent;
- run cards (`bg-card`, `border-line`, accent "+ Join", lead-day accent border, TODAY marker accent) read cleanly;
- the collapsed times (uniform) and neutral category pills stay scannable at length;
- admin status badges (Live/Draft/Unclaimed) still distinguishable for a signed-in leader.

- [ ] **Step 3: Full capability gate**

Run: `npm run test:e2e -- all-runs.spec.ts`
Expected: PASS at 24-run scale, spec unedited.

- [ ] **Step 4: Record the result**

If lovable: note the screenshots + "clean at 24 runs" in the PR. If a scale problem appears (e.g. the long category list feels heavy, or losing category color hurts scannability), STOP and raise it — that is a design signal for Lou, not something to silently ship. No commit unless Step 1 extended the seed (then commit that).

```bash
# only if seed-e2e.ts was extended:
git add scripts/seed-e2e.ts
git commit -m "test(#488): seed ~24 runs for All Runs scale verification"
```

---

## Notes for the executor

- **No new hero, no new component, no DB/migration** — this is a recolor of one component (`AllRunsClient.tsx`) plus a scale check. The dark hero is the Story-1 `Header`, already present.
- **The capability gate is sacred:** if `all-runs.spec.ts` needs an edit to pass, a recolor changed behavior — fix the recolor, not the test.
- **Keep the semantic state colors.** Flattening Live/Draft/Unclaimed/Remove/Setup to accent or neutral is a capability regression (a leader loses state signal), even though e2e may not catch it — the source test in Task 1 guards the main ones.
- **Contrast:** verify `text-muted` (#4a5464) and `text-accent` (#f0523d) on `bg-card`/`bg-surface` are legible; the accent-on-white active chip must meet AA for its text size.
