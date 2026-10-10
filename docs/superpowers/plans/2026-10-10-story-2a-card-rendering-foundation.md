# Card Layout — Story 2a: Rendering Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the `card_template` column into `RunConfig`, and make the Library card render through the Story-1 resolver — driven by the default layout — with **visual parity to today**. No editor, no preview (those are Story 2b).

**Architecture:** A pure per-field formatter layer (`describeField`, node-testable) sits on top of Story 1's `resolveCardLayout`. A thin presentational React component (`WorkoutCardBody`) renders a `ResolvedCard` by switching on each field's formatter output. `LibraryClient` calls `resolveCardLayout(workout, runConfig.cardTemplate)` and renders via that component, replacing the hardcoded `rawInput`/`coachingNotes`/`WorkoutMeta`/`WorkoutDetails` body. All rendering logic lives in pure functions (tested); the component only maps descriptors to the existing markup (verified by visual parity).

**Tech Stack:** TypeScript, React (Next.js App Router), vitest (node env — **no jsdom, no component unit tests**). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-10-configurable-card-layout-design.md`
**Builds on:** #500 (`lib/cardLayout.ts`: `resolveCardLayout`, `DEFAULT_CARD_TEMPLATE`, `hasValue`, `ResolvedCard/Row/Field`; `lib/data.ts`: `CardTemplate`, `CardFieldKey`).

## Global Constraints

- `cardTemplate` is `CardTemplate | null`; `null` = `DEFAULT_CARD_TEMPLATE`. No backfill. The `card_template` column already exists (shipped in #500) on all branches — **no migration in 2a**.
- vitest is **node env**; a React component cannot be unit-tested here. All testable logic goes into **pure functions** tested in node; the component is verified by **visual parity on the Preview URL**. Do not add jsdom/RTL.
- Visual parity is the bar: a run with no saved layout must render **identically to today's Library card**.
- Leader-auth unchanged; 2a is read + render only (no writes).

## Design decisions (baked in — review these)

1. **Which run's layout applies:** the Library view's **single `runConfig.cardTemplate`** drives every card, in both "Your run" and "All runs" modes (matches today — one card style per view; the toggle only filters which workouts show). No per-card owning-run lookup in 2a.
2. **Testability:** per-field rendering is extracted into a pure `describeField(workout, key)` returning a descriptor; the React component switches on `descriptor.kind`. Logic is node-tested; markup is parity-checked.
3. **`last ran` "Never used":** today the stats row always shows `Last ran …` or `Never used`. Story 1's `hasValue('lastRan')` skips when null, which would drop "Never used" and break parity. 2a changes `hasValue('lastRan')` to **always present**; `describeField` emits `Never used` for null. (Story-1 test updated to match.)
4. **The renderer absorbs `description` (rawInput) + `coachingNotes`**, which today render in the card body *above* `WorkoutMeta`. They're placeable fields (default: upfront), so they move into the resolver-driven renderer. The card **header** (name, type badge, variant label, flag/edit/delete, reactions, adopt controls) stays app-controlled in `LibraryClient`.

## Review Focus

- **A workout that has never run** (`lastRan = null`) → stats still show `Never used` (decision 3). (Task 3)
- **A MapMyRun workout** (`mapImageUrl = null`) placed with `mapImage` → image silently absent, no broken `<img>`. (Task 3/4, via resolver skip)
- **`card_template` column holds malformed/old-version JSON** → `parseCardTemplate` returns null (falls back to default), never throws into the render. (Task 1)
- **"All runs" Library mode** showing other runs' workouts → all cards use the viewing run's template; no crash when a workout's owning run differs. (Task 5)
- **A family card (grouped variants)** → each variant's body still renders through the shared component at every `WorkoutMeta` call site (391/471/502). (Task 5)

---

### Task 1: `parseCardTemplate` — safe JSONB → `CardTemplate | null`

**Files:**
- Modify: `lib/cardLayout.ts` (add `parseCardTemplate`)
- Test: `__tests__/cardLayout.test.ts` (extend)

**Interfaces:**
- Consumes: `CardTemplate` (lib/data.ts).
- Produces: `parseCardTemplate(raw: unknown): CardTemplate | null` — returns a valid `CardTemplate` or `null` (null → caller uses the default). Never throws.

- [ ] **Step 1: Write failing tests**

```ts
import { parseCardTemplate } from '../lib/cardLayout'

describe('parseCardTemplate', () => {
  test('null / undefined → null', () => {
    expect(parseCardTemplate(null)).toBeNull()
    expect(parseCardTemplate(undefined)).toBeNull()
  })
  test('valid template round-trips', () => {
    const t = { version: 1, upfront: [{ fields: [{ key: 'distance', align: 'left' }] }], expanded: [], hidden: [] }
    expect(parseCardTemplate(t)).toEqual(t)
  })
  test('wrong/old version → null (fall back to default)', () => {
    expect(parseCardTemplate({ version: 2, upfront: [], expanded: [], hidden: [] })).toBeNull()
  })
  test('malformed shape → null, never throws', () => {
    expect(parseCardTemplate('{}')).toBeNull()
    expect(parseCardTemplate({ version: 1 })).toBeNull()               // missing arrays
    expect(parseCardTemplate({ version: 1, upfront: 'x', expanded: [], hidden: [] })).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run __tests__/cardLayout.test.ts -t parseCardTemplate`
Expected: FAIL — `parseCardTemplate` not exported.

- [ ] **Step 3: Implement**

```ts
// lib/cardLayout.ts
export function parseCardTemplate(raw: unknown): CardTemplate | null {
  if (!raw || typeof raw !== 'object') return null
  const t = raw as Record<string, unknown>
  if (t.version !== 1) return null
  if (!Array.isArray(t.upfront) || !Array.isArray(t.expanded) || !Array.isArray(t.hidden)) return null
  // Shape is trusted enough for the resolver, which already ignores unknown keys
  // and skips valueless fields; deeper validation would duplicate resolver guards.
  return { version: 1, upfront: t.upfront, expanded: t.expanded, hidden: t.hidden } as CardTemplate
}
```

- [ ] **Step 4: Run to verify pass + commit**

Run: `npx vitest run __tests__/cardLayout.test.ts` → PASS.
```bash
git add lib/cardLayout.ts __tests__/cardLayout.test.ts
git commit -m "feat(#501): parseCardTemplate — safe JSONB validator"
```

---

### Task 2: Wire `card_template` into `getLeaderRun` + `getRunById`

**Files:**
- Modify: `lib/db.ts` (`getLeaderRun` ~238–268, `getRunById` ~755–784)

**Interfaces:**
- Consumes: `parseCardTemplate` (Task 1).
- Produces: `RunConfig.cardTemplate` populated from the DB (no longer stubbed null in these two functions).

- [ ] **Step 1: Add `card_template` to both SELECT column lists**

In `getLeaderRun` add `r.card_template` to the select (alongside `r.post_template`). Same in `getRunById`.

- [ ] **Step 2: Map it in both return objects**

Replace `cardTemplate: null` at `lib/db.ts:268` and `:784` with:
```ts
cardTemplate: parseCardTemplate(r.card_template),
```
Add the import: `import { parseCardTemplate } from './cardLayout'` (or extend the existing cardLayout import).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. Leave the other 6 stub sites (`app/schedule/page.tsx:28`, `app/library/page.tsx:32`, and the 4 test fixtures) as `cardTemplate: null` — those are fallback/fixture configs and correctly default.

- [ ] **Step 4: Verify the read round-trips against the test-data branch**

Write a throwaway check (or extend an existing db-backed check): set a run's `card_template` to a known JSON on the test-data branch, call `getLeaderRun`/`getRunById`, assert `cardTemplate` matches; set it back to NULL and assert `cardTemplate === null`. Confirm `parseCardTemplate` is actually invoked (not stubbed).

- [ ] **Step 5: Commit**

```bash
git add lib/db.ts
git commit -m "feat(#501): read card_template into RunConfig (getLeaderRun/getRunById)"
```

---

### Task 3: Pure per-field formatters (`describeField`) + `lastRan` presence fix

**Files:**
- Create: `lib/cardFields.ts`
- Modify: `lib/cardLayout.ts` (`hasValue('lastRan')` → always present)
- Test: `__tests__/cardFields.test.ts` (new); `__tests__/cardLayout.test.ts` (update the `hasValue` lastRan case)

**Interfaces:**
- Consumes: `WorkoutVariantRow`, `CardFieldKey`.
- Produces:
  - `FieldContent` discriminated union: `{kind:'text'; text; variant:'body'|'coaching'}` | `{kind:'author'; text}` | `{kind:'inline'; parts:string[]}` (distance) | `{kind:'text-inline'; text}` (lastRan) | `{kind:'link'; href; label}` (mapLink) | `{kind:'image'; src}` (mapImage) | `{kind:'pills'; variant:'race'|'phase'; items:string[]}` | `{kind:'detail'; label; value}` (reason/energySystem/hrZone/rpe/turnaround/routeNarrative).
  - `describeField(w: WorkoutVariantRow, key: CardFieldKey): FieldContent | null`.

- [ ] **Step 1: Update the Story-1 `hasValue` lastRan test, then flip the rule**

In `__tests__/cardLayout.test.ts`, change the `lastRan: null → false` assertion to expect **true** (lastRan always renders — shows "Never used"):
```ts
expect(hasValue({ ...full, lastRan: null }, 'lastRan')).toBe(true)
```
Then in `lib/cardLayout.ts` change the registry entry:
```ts
lastRan: () => true,   // always rendered: "Last ran …" or "Never used" (parity with today)
```
Run: `npx vitest run __tests__/cardLayout.test.ts` → PASS.

- [ ] **Step 2: Write failing tests for `describeField`**

```ts
// __tests__/cardFields.test.ts
import { describe, test, expect } from 'vitest'
import { describeField } from '../lib/cardFields'
import type { WorkoutVariantRow } from '../lib/data'
const full = { /* same fixture as cardLayout.test.ts — every field present */ } as WorkoutVariantRow

describe('describeField', () => {
  test('description → body text from rawInput', () => {
    expect(describeField(full, 'description')).toEqual({ kind: 'text', text: '800m loops', variant: 'body' })
  })
  test('coachingNotes → coaching text', () => {
    expect(describeField(full, 'coachingNotes')).toEqual({ kind: 'text', text: 'stay honest', variant: 'coaching' })
  })
  test('distance → inline parts (miles · elev · distTime)', () => {
    expect(describeField({ ...full, distTime: '' }, 'distance'))
      .toEqual({ kind: 'inline', parts: ['4.0 mi', '520 ft ↑'] })
  })
  test('lastRan present → "Last ran …"; null → "Never used"', () => {
    expect(describeField(full, 'lastRan')).toEqual({ kind: 'text-inline', text: 'Last ran Sep 30' })
    expect(describeField({ ...full, lastRan: null }, 'lastRan')).toEqual({ kind: 'text-inline', text: 'Never used' })
  })
  test('mapLink → link; mapImage → image', () => {
    expect(describeField(full, 'mapLink')).toEqual({ kind: 'link', href: 'http://map', label: 'Map ↗' })
    expect(describeField(full, 'mapImage')).toEqual({ kind: 'image', src: 'http://img' })
  })
  test('raceTypes/trainingPhases → pills', () => {
    expect(describeField(full, 'raceTypes')).toEqual({ kind: 'pills', variant: 'race', items: ['5K'] })
    expect(describeField(full, 'trainingPhases')).toEqual({ kind: 'pills', variant: 'phase', items: ['Build'] })
  })
  test('detail fields → label+value', () => {
    expect(describeField(full, 'energySystem')).toEqual({ kind: 'detail', label: 'Energy system', value: 'VO2' })
    expect(describeField(full, 'author')).toEqual({ kind: 'author', text: 'Sal' })
  })
})
```
(Use `formatDate` from the same util the card uses so "Sep 30" matches; import and assert against it rather than hardcoding if the format differs.)

- [ ] **Step 3: Run to verify fail**

Run: `npx vitest run __tests__/cardFields.test.ts`
Expected: FAIL — `describeField` not exported.

- [ ] **Step 4: Implement `describeField`**

Build the per-key mapping. Pull the exact value formatting from today's code so output matches: the stats parts from `LibraryClient.tsx:198–212` (`${miles.toFixed(1)} mi`, `${Math.round(elev)} ft ↑`, `distTime`), the `formatDate` usage for lastRan, the detail labels from `WorkoutDetails.tsx:70–99`. Return `null` for a key with no value (defensive; the resolver already skips). Reproduce the labels verbatim (e.g. "Energy system", "HR Zone", "RPE", "Turnaround", "Reason", "Route").

- [ ] **Step 5: Run to verify pass + commit**

Run: `npx vitest run __tests__/cardFields.test.ts __tests__/cardLayout.test.ts` → PASS.
```bash
git add lib/cardFields.ts lib/cardLayout.ts __tests__/cardFields.test.ts __tests__/cardLayout.test.ts
git commit -m "feat(#501): pure describeField formatters + lastRan always-present"
```

---

### Task 4: Shared renderer component `WorkoutCardBody`

**Files:**
- Create: `components/WorkoutCardBody.tsx`

**Interfaces:**
- Consumes: `resolveCardLayout` (lib/cardLayout.ts), `describeField` (lib/cardFields.ts), `WorkoutVariantRow`, `CardTemplate`.
- Produces: `<WorkoutCardBody workout={w} layout={cardTemplate|null} expanded={boolean} onToggle={() => void} />` — renders the upfront rows inline and, when `expanded`, the expanded rows; renders a "Show details"/"Hide details" toggle when the resolved `expanded` section is non-empty.

- [ ] **Step 1: Implement the component**

- Call `const resolved = resolveCardLayout(workout, layout)`.
- Render `resolved.upfront` rows: each row is a flex container (`justify-between`) with a left group and a right group; map each `ResolvedField` through `describeField(workout, field.key)` and render by `kind`, **reusing the exact markup/classes** from the current code:
  - `text` body → the `rawInput` paragraph classes (`LibraryClient.tsx` body `text-sm text-ink … whitespace-pre-wrap`); `coaching` → the italic muted classes.
  - `inline` (distance) + `text-inline` (lastRan) → the stats-row classes (`text-xs text-muted`), joining multiple fields in a row with `·` (as `LibraryClient.tsx:198–212`).
  - `link` → the `Map ↗` anchor (`text-xs font-semibold text-accent`, `stopPropagation`, `target=_blank rel=noopener`).
  - `pills` → race/phase pill classes incl. `PHASE_COLORS` (from `LibraryClient`/`WorkoutDetails`).
  - `image` → the map image markup from `WorkoutDetails.tsx:100–114`.
  - `detail` → the `DetailRow` label+value markup from `WorkoutDetails.tsx`.
  - `author` → italic `— {text}`.
- Render the "Show details" toggle + `resolved.expanded` rows (same row renderer) only when `resolved.expanded.length > 0`, using the existing toggle button classes.
- Keep the component **presentational** — no data logic beyond calling the resolver + formatter.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` → no errors. (No unit test — node-env vitest can't render React; parity is verified in Task 5 on Preview.)

- [ ] **Step 3: Commit**

```bash
git add components/WorkoutCardBody.tsx
git commit -m "feat(#501): shared WorkoutCardBody renderer (resolver-driven)"
```

---

### Task 5: Wire `WorkoutCardBody` into `LibraryClient` + parity verification

**Files:**
- Modify: `components/LibraryClient.tsx` (remove `WorkoutMeta`; replace body `rawInput`/`coachingNotes`/`WorkoutMeta` block at the 3 card render sites ~391/471/502; thread the layout in)
- Modify: `app/library/page.tsx` (pass `runConfig.cardTemplate` to `LibraryClient`)

**Interfaces:**
- Consumes: `WorkoutCardBody` (Task 4), `RunConfig.cardTemplate` (Task 2).

- [ ] **Step 1: Pass the layout from the page**

In `app/library/page.tsx`, pass `cardTemplate={runConfig.cardTemplate}` to `<LibraryClient … />`. Add the prop to `LibraryClient`'s props type.

- [ ] **Step 2: Replace the card body at all three render sites**

At each site that renders the card body (standalone ~370–410, expanded family standard ~471, variation ~502), replace the inline `rawInput`/`coachingNotes` paragraphs **and** `<WorkoutMeta w={w} />` with:
```tsx
<WorkoutCardBody
  workout={w}
  layout={cardTemplate}
  expanded={expandedNotes === w.id}
  onToggle={() => setExpandedNotes(expandedNotes === w.id ? null : w.id)}
/>
```
Keep the card **header** (name, type badge, variant label, flag/edit/delete, `ReactionPicker`, `adoptControls`) exactly as-is. Delete the now-unused `WorkoutMeta` function. Leave `WorkoutDetails.tsx` in place for now (other callers may exist; the Library path no longer uses it) — grep for remaining `WorkoutDetails`/`WorkoutMeta` usages and only delete what's fully orphaned.

- [ ] **Step 3: Typecheck + unit suite**

Run: `npx tsc --noEmit` → clean. Run: `npm run test:unit` → green (resolver + formatter + parse tests).

- [ ] **Step 4: Visual parity verification on Preview**

Open the PR's Preview URL, Library screen, signed in as the test leader (TigerWolves has no saved layout → default). Confirm against `main`: stats row (distance · elev · last-ran), `Map ↗` upfront, race/phase pills, author, description + coaching notes, and "Show details" revealing reason/energy/HR/RPE/turnaround/route — all **identical** to today. Check a "Never used" workout and a family (grouped) card. Capture before/after screenshots in the PR.

- [ ] **Step 5: Commit**

```bash
git add components/LibraryClient.tsx app/library/page.tsx
git commit -m "feat(#501): Library renders via WorkoutCardBody from the run's layout"
```

---

## Self-Review

**1. Spec coverage (2a slice):** read wiring (Task 2) ✓; shared resolver-driven renderer (Task 4) ✓; Library consumption from default w/ parity (Task 5) ✓; layout-resolution decision documented (decision 1) ✓. Editor/preview/Schedule/MyPlan correctly deferred.

**2. Placeholder scan:** No "TODO/handle edge cases." Markup reproduction points to exact source line ranges (concrete, not vague). The only judgement left to the builder — matching existing Tailwind classes — is pinned to specific files/lines and gated by the visual-parity AC.

**3. Type consistency:** `parseCardTemplate` (Task 1) is consumed in Task 2; `FieldContent`/`describeField` (Task 3) consumed in Task 4; `WorkoutCardBody` (Task 4) consumed in Task 5; `cardTemplate` prop threaded page→client→component. `hasValue('lastRan')` change (Task 3) is matched by the updated Story-1 test in the same step.

**4. Review Focus:** "Never used" (Task 3 test), map-image skip (resolver, Task 3/4), malformed JSON (Task 1 test), All-runs mode + family cards (Task 5 verification). Section non-empty.
