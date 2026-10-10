# NBR reskin — Story 2b: Library, Races, run detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the three lighter public screens — Library, Races, and run detail — onto the NBR design system, reusing the exact token vocabulary Story 2a shipped, preserving every capability.

**Architecture:** A near-mechanical recolor. These components are Tailwind-class-based (almost no hex), and all three e2e suites assert on testids/text/roles — never on color — so the recolor is safe. Shared workout sub-components (WorkoutDetails, flag/reaction/adopt/rating widgets) are recolored once (Task 1) and feed both Library and run detail (and, incidentally, Story 3's Schedule/My Plan — a consistent free head-start). Each screen keeps its **semantic STATE colors** (verified/flagged/pending, urgency, joined, draft, destructive); every **classification** color-coding (workout type, race tier, training phase) collapses to the one neutral pill, exactly as 2a collapsed run-category colors — the label text carries the meaning.

**Tech Stack:** Next.js 16 (App Router), Tailwind CSS v4 (`@theme` semantic utilities from Story 1), TypeScript, vitest (source-assertion tests), Playwright (e2e capability gate + visual check).

**Spec:** `docs/superpowers/specs/2026-10-04-nbr-reskin-design.md` (published in epic #466 `## Design`).

**Branch:** builds on `redesign/nbr` (Stories 1 + 2a already landed there). Build on a story branch off `redesign/nbr` (e.g. `story/491-public-screens`), PR into `redesign/nbr`. Does not merge to `main` until all reskin stories are verified together.

## Global Constraints

- **Reskin only — preserve 100% of capabilities.** `e2e/library.spec.ts`, `e2e/races.spec.ts`, `e2e/per-run.spec.ts` must stay green. Because 2b touches **shared** components used by Schedule/My Plan, the **full** e2e suite (incl. `my-plan`, `schedule`) must also stay green. If any spec needs an edit to pass, a recolor changed behavior — stop and justify or revert.
- **ONE sanctioned test edit (approved), and only this one:** in `e2e/library.spec.ts`, swap the card **selector** `.bg-white.rounded-2xl` → `[data-testid="workout-card"]` (4 sites). This is a selector de-coupling — a brittle presentation-class hook replaced by a stable testid — with **no change to any assertion or to what behavior is verified**. It lets the Library card use the `bg-card` token instead of a hardcoded `bg-white`. Every other spec stays byte-for-byte unchanged; no assertion anywhere is edited. If you find yourself wanting to change an *assertion* (not a selector), stop — that's a behavior change.
- **Reuse the 2a vocabulary verbatim** (shipped in `components/AllRunsClient.tsx`): cards → `bg-card`; page/section → `bg-surface`; borders → `border-line`; body text → `text-ink`; secondary → `text-muted`; primary actions + active/selected states → `bg-accent text-white` / `border-accent` / `text-accent`; **neutral non-semantic pill** → `bg-surface text-muted border border-line` (2a named this `CATEGORY_PILL_CLASS`).
- **No new hardcoded hex / no literal `orange-*`/`gray-*`/`bg-white` where a token applies.**
- **Collapse all classification color-coding to the neutral pill** (ruling, approved): workout **type** (Hills/Tempo/… `TYPE_COLORS`), race **tier** (Target/Tune-Up/Fun), training **phase** (Base/Build/Peak/Taper `PHASE_COLORS`). Keep each pill's text label.
- **Keep semantic STATE colors** (they encode status, not brand): race status circles (verified green / flagged red / pending yellow), verified/unverified badges, the `≤30-day` urgency badge (red), the flag/"issue reported" affordance (red), the leader verify affordance (green), workout **draft** state, and any **destructive** control (red).
- **"Joined"/following done-state → neutral pill** (matching 2a): the join CTA is accent; the already-joined state is the neutral pill, not green (the text says "Joined").
- **Preserve every `data-testid`, `data-tour`, `aria-label`, `href`, role, and visible text string.**
- **MLP** — genuinely clean at real scale, not merely recolored.

## Review Focus

- **A shared-component recolor silently breaks Schedule/My Plan** (WorkoutDetails / flag / reaction widgets are shared) → the full-suite e2e gate (not just the three 2b specs) is the guard. (Task 5.)
- **The Library card selector de-coupling** → `library.spec.ts` (lines 118, 128, 181, 189) currently finds cards via `page.locator('.bg-white.rounded-2xl', ...)`. The card is retokenized to `bg-card`, so it gains a `data-testid="workout-card"` and the 4 locators switch to `[data-testid="workout-card"]` — selector only, assertions untouched. Verify the `hasText` filters still pin to the right cards and the full Library e2e passes. (Task 2.)
- **A semantic state color flattened** (verified/flagged/pending circle, urgency, draft, destructive) → a user loses status signal. Source tests assert the state classes remain. (Tasks 1, 3, 4.)
- **The join CTA loses its accent / becomes unclickable-looking**, or the disabled draft-follow state stops reading as disabled. (Task 4.)
- **Run-detail "compact hero"** — the emoji is already inline with the title in the Story-1 `Header` (`title = "${emoji} ${name}"`); confirm no regression, no new hero needed. (Task 4.)

---

### Task 1: Recolor shared workout sub-components

Recolor the components shared by Library and run detail (and Schedule/My Plan). Doing these first means Tasks 2 & 4 inherit them.

**Files:**
- Modify: `components/WorkoutDetails.tsx` (phase pills, chips, labels), `components/WorkoutFlagSheet.tsx` (FlagBadge + ghost button), `components/AdoptRouteControls.tsx`, `components/RatingFilter.tsx`, `components/DeleteWorkoutButton.tsx`
- Test: `__tests__/sharedWorkoutReskin.test.ts`

**Mapping:**

| Current | → New | Element |
|---|---|---|
| `PHASE_COLORS` map: `bg-blue-100 text-blue-700` (Base), `bg-orange-100 text-orange-700` (Build), `bg-red-100 text-red-700` (Peak), `bg-green-100 text-green-700` (Taper) | one shared neutral pill `bg-surface text-muted border border-line` | phase pills — **collapse** |
| race-type chips `bg-gray-100 text-gray-500` | `bg-surface text-muted border border-line` | metadata chips |
| generic chip fallback `bg-gray-100 text-gray-700` | `bg-surface text-muted border border-line` | WorkoutDetails chips |
| label `text-gray-700`, value `text-gray-600` | `text-ink` (label), `text-muted` (value) | detail rows |
| author line `text-gray-400 italic` | `text-muted italic` | author |
| `bg-red-500` (FlagBadge solid) | **keep** (destructive/issue state) | flag badge |
| flag ghost button `border border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300` | `border border-line text-muted hover:text-ink` | flag ghost |
| any `bg-white` container | `bg-card` | panels |
| AdoptRouteControls / RatingFilter / DeleteWorkoutButton neutral grays + any orange primary | grays → `text-muted`/`bg-surface`/`border-line`; orange primary/active → `bg-accent text-white` / `text-accent`; destructive → **keep red** | controls |

- [ ] **Step 1: Write the failing source test**

```ts
// __tests__/sharedWorkoutReskin.test.ts
import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
const read = (p: string) => readFileSync(path.resolve(__dirname, '..', p), 'utf8')

describe('shared workout sub-components reskin (#491)', () => {
  test('phase pills collapsed to the neutral pill (no per-phase colors)', () => {
    const s = read('components/WorkoutDetails.tsx')
    for (const dead of ['bg-blue-100', 'text-blue-700', 'bg-orange-100', 'text-orange-700', 'text-red-700', 'bg-green-100', 'text-green-700']) {
      expect(s).not.toContain(dead)
    }
    expect(s).toContain('bg-surface')
    expect(s).toContain('text-muted')
    expect(s).toContain('border-line')
  })
  test('destructive flag badge stays red (state preserved)', () => {
    expect(read('components/WorkoutFlagSheet.tsx')).toContain('bg-red-500')
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run __tests__/sharedWorkoutReskin.test.ts` → FAIL.
- [ ] **Step 3: Apply the mapping** across the five files. Only color classes — never a testid/text/aria/href.
- [ ] **Step 4: Pass + typecheck** — `npx vitest run __tests__/sharedWorkoutReskin.test.ts` → PASS; `npx tsc --noEmit` → clean.
- [ ] **Step 5: Commit**

```bash
git add components/WorkoutDetails.tsx components/WorkoutFlagSheet.tsx components/AdoptRouteControls.tsx components/RatingFilter.tsx components/DeleteWorkoutButton.tsx __tests__/sharedWorkoutReskin.test.ts
git commit -m "feat(#491): recolor shared workout sub-components onto NBR tokens (phase pills → neutral)"
```

---

### Task 2: Recolor Library

**Files:**
- Modify: `components/LibraryClient.tsx`
- Test: `__tests__/libraryReskin.test.ts`

**Mapping:**

| Current | → New | Element |
|---|---|---|
| filter/toggle/sort active `bg-gray-900 text-white` | `bg-accent text-white` | active "Your run"/"All runs", category, race, sort |
| type-filter active `bg-orange-500 text-white` | `bg-accent text-white` | active type filter |
| inactive pills `bg-white border border-gray-200 text-gray-600` | `bg-card border border-line text-muted` | all inactive filter pills |
| search `border border-gray-200 bg-white`, `focus:border-orange-400`, icon `text-gray-400` | `border border-line bg-card`, `focus:border-accent`, `text-muted` | search |
| add button `bg-orange-500 text-white shadow-sm` | `bg-accent text-white shadow-sm` | add workout |
| cards `bg-white border border-gray-100 shadow-sm` | `bg-card border border-line shadow-sm` + add `data-testid="workout-card"` | workout/family cards (testid replaces the `.bg-white` e2e hook) |
| titles `text-gray-900`; subtitles/timestamps `text-gray-400`; body `text-gray-700`; notes `text-gray-500` | `text-ink`; `text-muted`; `text-ink`/`text-muted` | card text |
| edit button `border border-gray-200 text-gray-400` | `border border-line text-muted` | edit |
| type pill (footer) `bg-gray-100 text-gray-600`; 2-variant count `bg-orange-100 text-orange-600` | `bg-surface text-muted border border-line` (neutral pill) | type tag pills — **collapse** |
| "Variation N of M" `text-orange-500` | `text-accent` | variation label |
| "Show details" / "Add variation" links `text-orange-500` | `text-accent` | links |
| add-variation dashed pill `border border-dashed border-orange-200 text-orange-500` | `border border-dashed border-accent text-accent` | add-variation affordance |
| abbrev key `bg-gray-50 border border-gray-100`, title `text-gray-700`, items `text-gray-800`/`text-gray-500` | `bg-surface border border-line`, `text-ink`, `text-ink`/`text-muted` | abbreviation key |

**The card selector de-coupling (the one sanctioned test edit):** `library.spec.ts` finds workout cards via `page.locator('.bg-white.rounded-2xl', { hasText: ... })` at lines 118, 128, 181, 189. Because the card is being retokenized to `bg-card` (dropping the `bg-white` class the selector keys on), do this precisely:
1. In `LibraryClient.tsx`, add `data-testid="workout-card"` to **every** card container that currently carries `bg-white rounded-2xl` (the standalone card AND the family card — the elements the e2e's `hasText` filters resolve to). Recolor those containers `bg-white` → `bg-card`.
2. In `e2e/library.spec.ts`, change the 4 locators from `page.locator('.bg-white.rounded-2xl', { hasText: X })` to `page.locator('[data-testid="workout-card"]', { hasText: X })`. **Change the selector string only** — keep every `hasText`, every assertion, every other line identical.
3. This is the ONLY edit to any spec in all of 2b. It is a selector swap, not a behavior change. Confirm `git diff e2e/` shows exactly these 4 selector changes and nothing else.

- [ ] **Step 1: failing source test**

```ts
// __tests__/libraryReskin.test.ts
import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
const src = readFileSync(path.resolve(__dirname, '../components/LibraryClient.tsx'), 'utf8')
describe('Library reskin (#491)', () => {
  test('NBR tokens + accent-active present', () => {
    for (const t of ['bg-card', 'border-line', 'text-ink', 'text-muted', 'bg-accent', 'text-accent']) expect(src).toContain(t)
  })
  test('orange + gray-900 active + neutral-pill-collapse: dead classes gone', () => {
    for (const dead of ['bg-orange-500', 'bg-orange-100', 'text-orange-600', 'text-orange-500', 'focus:border-orange-400', 'bg-gray-900']) expect(src).not.toContain(dead)
  })
  test('workout card tokenized to bg-card + carries the stable testid', () => {
    expect(src).toContain('bg-card')
    expect(src).toContain('data-testid="workout-card"')
  })
})
```

- [ ] **Step 2: fails** → `npx vitest run __tests__/libraryReskin.test.ts`.
- [ ] **Step 3: apply mapping** (color classes only; preserve testids/text/`.rounded-2xl` card hook).
- [ ] **Step 4: pass + tsc** → `npx vitest run __tests__/libraryReskin.test.ts`; `npx tsc --noEmit`.
- [ ] **Step 5: capability gate** → `npm run test:e2e -- library.spec.ts` → PASS. The ONLY spec change is the 4-site selector swap from Step 3; confirm `git diff e2e/library.spec.ts` shows exactly those 4 selector edits and no assertion changes.
- [ ] **Step 6: commit**

```bash
git add components/LibraryClient.tsx e2e/library.spec.ts __tests__/libraryReskin.test.ts
git commit -m "feat(#491): recolor Library onto NBR tokens (type pills → neutral, card selector → testid)"
```

---

### Task 3: Recolor Races

**Files:**
- Modify: `components/RacesClient.tsx`
- Test: `__tests__/racesReskin.test.ts`

**Mapping:**

| Current | → New | Element |
|---|---|---|
| add-race button `bg-orange-600 text-white shadow-orange-600/25` | `bg-accent text-white shadow-sm` | add race |
| submit buttons `bg-orange-600 text-white` | `bg-accent text-white` | Add/Fix submit |
| cancel/dismiss `bg-gray-100 text-gray-700` | `bg-surface text-muted` | cancel |
| cards `bg-white border border-gray-100 shadow-sm` | `bg-card border border-line shadow-sm` | race cards |
| title `text-gray-900`; date `text-gray-500`; meta `text-gray-400`; count `text-gray-500` | `text-ink`; `text-muted`; `text-muted`; `text-muted` | card text |
| tier pills Target `bg-orange-100 text-orange-700` / Tune-Up `bg-blue-100 text-blue-800` / Fun `bg-green-100 text-green-800`, selected ring `ring-2 ring-*-400` | one neutral pill `bg-surface text-muted border border-line`; selected → `ring-2 ring-accent` (or `border-accent`) | race tier pills — **collapse** (selected state = accent ring) |
| `>30-day` badge `bg-blue-50 text-blue-600` | `bg-surface text-muted border border-line` | non-urgent info badge |
| form inputs `border border-gray-300 text-gray-900`; labels `text-gray-500`; help `text-gray-400 italic` | `border border-line text-ink`; `text-muted`; `text-muted italic` | forms |
| **KEEP (state):** status circles `bg-green-500`/`bg-red-500`/`bg-yellow-500`; verified badge `bg-green-100 text-green-800`; unverified `bg-gray-200 text-gray-500`; `≤30-day` urgency `bg-red-100 text-red-700`; "issue reported" `bg-red-100 text-red-800`; verify button `bg-green-100 text-green-800` | unchanged | status / verify / flag |

- [ ] **Step 1: failing source test**

```ts
// __tests__/racesReskin.test.ts
import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
const src = readFileSync(path.resolve(__dirname, '../components/RacesClient.tsx'), 'utf8')
describe('Races reskin (#491)', () => {
  test('NBR tokens present; orange primary gone; tier colors collapsed', () => {
    for (const t of ['bg-accent', 'bg-card', 'border-line', 'text-ink', 'text-muted']) expect(src).toContain(t)
    for (const dead of ['bg-orange-600', 'bg-orange-100', 'text-orange-700', 'bg-blue-100', 'bg-blue-50']) expect(src).not.toContain(dead)
  })
  test('semantic status colors preserved', () => {
    for (const keep of ['bg-green-500', 'bg-red-500', 'bg-yellow-500', 'bg-green-100', 'bg-red-100']) expect(src).toContain(keep)
  })
})
```

- [ ] **Step 2: fails** → `npx vitest run __tests__/racesReskin.test.ts`.
- [ ] **Step 3: apply mapping** (keep status/verify/flag/urgency colors; collapse tier pills; preserve `data-testid="race-card-*"` + button text).
- [ ] **Step 4: pass + tsc**.
- [ ] **Step 5: capability gate** → `npm run test:e2e -- races.spec.ts` → PASS, spec unedited.
- [ ] **Step 6: commit**

```bash
git add components/RacesClient.tsx __tests__/racesReskin.test.ts
git commit -m "feat(#491): recolor Races onto NBR tokens (tier pills → neutral, status colors kept)"
```

---

### Task 4: Recolor run detail

**Files:**
- Modify: `components/RunFollowToggle.tsx`, `components/GroupRunClient.tsx`, `components/GroupRunCard.tsx`, `app/runs/[id]/page.tsx` (description text only)
- Test: `__tests__/runDetailReskin.test.ts`

**Mapping:**

| Current | → New | Element |
|---|---|---|
| follow not-joined `bg-orange-500 text-white shadow-sm` | `bg-accent text-white shadow-sm` | Join CTA |
| follow joined `bg-green-100 text-green-800` | `bg-surface text-muted border border-line` | Joined done-state (neutral, matching 2a) |
| follow disabled `bg-gray-100 text-gray-400` | `bg-surface text-muted` | disabled (draft) |
| GroupRunClient floating "Next up" pill `bg-gray-900/70 text-white` | `bg-chrome/80 text-chrome-text` | scroll-position pill (dark overlay → chrome) |
| GroupRunCard next-upcoming border `border-orange-300` | `border-accent` | next card |
| "NEXT UP" label `text-orange-500` | `text-accent` | marker |
| upcoming card `bg-white border-gray-100`; past card `bg-[#f8f8f9] border-[#e2e4e7]` | `bg-card border-line`; `bg-surface border-line` | cards |
| date upcoming `text-gray-500` / past `text-gray-400`; title upcoming `text-gray-900` / past `text-[#8b8f97]`; placeholder `text-gray-400`; set/route text `text-gray-600`; leader upcoming `text-gray-500` / past `text-[#a3a7ad]` | `text-muted`; `text-ink` / `text-muted`; `text-muted`; `text-muted`; `text-muted` | card text |
| `TYPE_COLORS` map (Hills green, Broken Tempo blue, Progression purple, Ladder orange, Superset red, Straight Tempo yellow, Threshold pink, fallback gray) | one neutral pill `bg-surface text-muted border border-line` | type pills — **collapse** |
| past-card type pill `bg-[#e9eaec] text-[#9ca3af]` | `bg-surface text-muted border border-line` | past type pill |
| "Edit schedule →" `text-orange-600 border border-orange-300`; "View route ↗" `text-orange-600` | `text-accent border border-accent`; `text-accent` | leader/route links |
| "Edit in library →" `text-gray-500 border border-gray-300 bg-white` | `text-muted border border-line bg-card` | past edit link |
| description `text-gray-500` (run page) | `text-muted` | description |
| detail panel border `border-t border-gray-100` | `border-t border-line` | expander |

- [ ] **Step 1: failing source test**

```ts
// __tests__/runDetailReskin.test.ts
import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
const read = (p: string) => readFileSync(path.resolve(__dirname, '..', p), 'utf8')
describe('run detail reskin (#491)', () => {
  test('follow toggle: join accent, joined/disabled neutral', () => {
    const s = read('components/RunFollowToggle.tsx')
    expect(s).toContain('bg-accent')
    for (const dead of ['bg-orange-500', 'bg-green-100', 'text-green-800']) expect(s).not.toContain(dead)
  })
  test('GroupRunCard: type pills collapsed, markers → accent', () => {
    const s = read('components/GroupRunCard.tsx')
    expect(s).toContain('text-accent'); expect(s).toContain('border-accent')
    for (const dead of ['bg-purple-100', 'bg-pink-100', 'border-orange-300', 'text-orange-500', 'text-orange-600', '#8b8f97', '#f8f8f9']) expect(s).not.toContain(dead)
  })
})
```

- [ ] **Step 2: fails**.
- [ ] **Step 3: apply mapping** (preserve all `data-testid`, `data-tour`, `header h1`/`header p` structure, button text).
- [ ] **Step 4: pass + tsc**.
- [ ] **Step 5: capability gate** → `npm run test:e2e -- per-run.spec.ts` → PASS, spec unedited.
- [ ] **Step 6: commit**

```bash
git add components/RunFollowToggle.tsx components/GroupRunClient.tsx components/GroupRunCard.tsx app/runs/[id]/page.tsx __tests__/runDetailReskin.test.ts
git commit -m "feat(#491): recolor run detail onto NBR tokens (type pills → neutral, join → accent)"
```

---

### Task 5: Full verification (incl. shared-component ripple) + visual

**Files:** none (verification); possibly a throwaway Playwright script.

- [ ] **Step 1: full unit suite + typecheck** — `npx vitest run && npx tsc --noEmit` → PASS.
- [ ] **Step 2: FULL e2e suite** — `npm run test:e2e` → PASS. Every spec is unedited **except** the single sanctioned selector swap in `library.spec.ts` (4 sites, `.bg-white.rounded-2xl` → `[data-testid="workout-card"]`, no assertion change). This is the critical gate: Task 1 recolored **shared** components used by `schedule`/`my-plan`, so those specs (not just library/races/per-run) must stay green. Confirm `git diff e2e/` contains ONLY those 4 selector lines — any other spec change = a capability change; fix the component, not the test.
- [ ] **Step 3: visual check vs Option 1 mockups** — Playwright screenshots (logged-out + signed-in leader via `.env.test`) of `/library`, `/races`, and a run-detail page, compared to `docs/superpowers/specs/assets/tenant-config/option1-screens-v14.html` (Library = chips + cards screen; run detail = emoji-hero screen; Races = NOV cards screen). Confirm: dark header over light surface; filters/pills neutral with accent-active; primary buttons accent; status colors still legible; collapsed type/tier/phase pills read cleanly; Schedule/My Plan still render (partially reskinned via shared components — expected, not broken).
- [ ] **Step 4: record** — screenshots + "all e2e green unedited" in the PR. If a shared-component change visibly broke Schedule/My Plan layout (not just color), STOP and raise it.

---

## Notes for the executor

- **No DB / migration. No new components or new UI** — run detail's "compact hero" is already the Story-1 `Header` (emoji inline with the title); do not add one.
- **The capability gate is the full suite**, not just the three 2b specs — shared components ripple into Schedule/My Plan.
- **Exactly one spec is touched, and only its selector:** `library.spec.ts`'s 4 card locators swap `.bg-white.rounded-2xl` → `[data-testid="workout-card"]` (the card is retokenized to `bg-card`). No assertion, and no other spec, changes. `git diff e2e/` must show only those 4 selector lines.
- **Keep every semantic STATE color** — flattening verified/flagged/pending/urgency/draft/destructive is a capability regression even if e2e doesn't catch it; the source tests guard the main ones.
- **Reuse 2a's `CATEGORY_PILL_CLASS` value** (`bg-surface text-muted border border-line`) for every collapsed pill so the neutral pill is identical across the app.
