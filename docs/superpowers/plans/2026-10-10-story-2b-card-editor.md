# Card Layout — Story 2b: Editor + Save Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A leader can arrange their run's card layout — move each field between upfront / expanded / hidden, group fields onto rows, set left/right alignment, reorder rows — in a new "Card layout" tab, and **save** it. Library (already resolver-driven from 2a) then reflects it. No live preview (that's 2c); the leader verifies on the real Library screen.

**Architecture:** All layout edits are **pure functions** over `CardTemplate` (`lib/cardLayoutOps.ts`, node-tested) — move-controls, not drag, so there's no DnD library and the UI is just buttons calling these ops. `CardTemplateTab` holds the working `CardTemplate` in state, renders it with per-field buttons wired to the ops, and saves via a new leader-only `saveCardTemplate` action (mirrors `savePostTemplate`). Mounted as a tab in `RunConfigClient`.

**Tech Stack:** TypeScript, React (Next.js App Router Server Actions), vitest (node env — ops are node-tested; the component is verified on Preview). **No new dependencies.**

**Spec:** `docs/superpowers/specs/2026-10-10-configurable-card-layout-design.md`
**Builds on:** #500 (`CardTemplate`, `CardFieldKey`, `FieldAlign`, `DEFAULT_CARD_TEMPLATE`) and #501 (`describeField`, `WorkoutCardBody`, `parseCardTemplate`, `runs.card_template` read into `RunConfig.cardTemplate`). Patterns to mirror: `components/PostTemplateTab.tsx`, `savePostTemplate` (`app/run-config/actions.ts:87`), the tab wiring in `components/RunConfigClient.tsx:11-37`.

## Global Constraints

- **No new dependencies.** Move-controls (buttons), not drag-and-drop.
- Save is **leader-only**, via the same gate as `savePostTemplate` (`authorizeWriteCaller` + `assertCanManageRun`), and must call `updateTag('tigerwolves-data')` so Library read-your-own-writes works.
- Column already exists (#500); **no migration**.
- Layout ops are **pure and immutable** (never mutate the input `CardTemplate`); all logic is node-tested. The React component carries no layout logic beyond calling ops + `setState`.
- `saveCardTemplate` serializes the working `CardTemplate` straight to the `card_template` JSONB column; `parseCardTemplate` (#501) guards the read side.

## Review Focus

- **A field dragged to Hidden then back** → it reappears in the target section as its own row, not lost. (Task 1)
- **`mergeRowUp` on the first row (index 0)** → no-op, no crash (nothing above to merge into). (Task 1)
- **`moveRow` past the top/bottom edge** → clamped no-op. (Task 1)
- **A saved layout missing a field** (future field) → editor shows it under Hidden (via `normalizeTemplate`), so every field is always reachable. (Task 1)
- **Save failure** (network / server action throw) → the tab surfaces an error and doesn't claim "Saved!" — each call site wrapped in try/catch + `Sentry.captureException` (per the repo guardrail). (Task 2/3)

---

### Task 1: Pure layout ops + field labels (`lib/cardLayoutOps.ts`)

**Files:**
- Create: `lib/cardLayoutOps.ts`
- Test: `__tests__/cardLayoutOps.test.ts`

**Interfaces:**
- Consumes: `CardTemplate`, `CardFieldKey`, `FieldAlign` (lib/data.ts), `DEFAULT_CARD_TEMPLATE` (lib/cardLayout.ts).
- Produces (all pure, returning a NEW `CardTemplate`):
  - `type RowSection = 'upfront' | 'expanded'`
  - `type Destination = RowSection | 'hidden'`
  - `normalizeTemplate(t: CardTemplate | null): CardTemplate` — `null` → `DEFAULT_CARD_TEMPLATE`; then ensure every `CardFieldKey` appears exactly once (any missing key appended to `hidden`).
  - `moveToField(t, key, dest: Destination): CardTemplate` — remove `key` from wherever it is; `hidden` → push to `hidden[]`; a row section → append a new single-field row `{fields:[{key, align:'left'}]}`.
  - `setAlign(t, key, align): CardTemplate`
  - `moveRow(t, section: RowSection, rowIndex, dir:'up'|'down'): CardTemplate` — swap with neighbor; clamp at edges (no-op).
  - `mergeRowUp(t, section, rowIndex): CardTemplate` — append row `rowIndex`'s fields onto row `rowIndex-1`, drop row `rowIndex`; `rowIndex===0` → no-op.
  - `splitToNewRow(t, key): CardTemplate` — pull `key` out of its current row into a fresh single-field row immediately after it.
  - `CARD_FIELD_LABELS: Record<CardFieldKey, string>` — human labels for the chips.

- [ ] **Step 1: Write failing tests**

```ts
// __tests__/cardLayoutOps.test.ts
import { describe, test, expect } from 'vitest'
import { normalizeTemplate, moveToField, setAlign, moveRow, mergeRowUp, splitToNewRow } from '../lib/cardLayoutOps'
import type { CardTemplate } from '../lib/data'

const base: CardTemplate = {
  version: 1,
  upfront: [{ fields: [{ key: 'distance', align: 'left' }, { key: 'mapLink', align: 'right' }] },
            { fields: [{ key: 'raceTypes', align: 'left' }] }],
  expanded: [{ fields: [{ key: 'reason', align: 'left' }] }],
  hidden: ['author'],
}
const keysOf = (rows: CardTemplate['upfront']) => rows.map(r => r.fields.map(f => f.key))

test('normalizeTemplate(null) → default, every field present once', () => {
  const t = normalizeTemplate(null)
  const all = [...t.upfront, ...t.expanded].flatMap(r => r.fields.map(f => f.key)).concat(t.hidden)
  expect(new Set(all).size).toBe(15)       // all CardFieldKeys, no dupes
})
test('normalizeTemplate appends a missing field to hidden', () => {
  const stripped: CardTemplate = { version:1, upfront:[], expanded:[], hidden:[] }
  expect(normalizeTemplate(stripped).hidden).toContain('author')  // and the other 14
})
test('moveToField to hidden removes from rows and adds to hidden', () => {
  const t = moveToField(base, 'mapLink', 'hidden')
  expect(keysOf(t.upfront)).toEqual([['distance'], ['raceTypes']])
  expect(t.hidden).toContain('mapLink')
})
test('moveToField to a section appends a new single-field row; align resets left', () => {
  const t = moveToField(base, 'author', 'expanded')   // was hidden
  expect(t.hidden).not.toContain('author')
  expect(t.expanded.at(-1)).toEqual({ fields: [{ key: 'author', align: 'left' }] })
})
test('setAlign changes only that field', () => {
  const t = setAlign(base, 'distance', 'right')
  expect(t.upfront[0].fields.find(f => f.key==='distance')!.align).toBe('right')
})
test('moveRow clamps at edges, swaps otherwise', () => {
  expect(moveRow(base, 'upfront', 0, 'up')).toEqual(base)        // no-op at top
  expect(keysOf(moveRow(base, 'upfront', 0, 'down').upfront)).toEqual([['raceTypes'], ['distance','mapLink']])
})
test('mergeRowUp merges into the row above; index 0 is a no-op', () => {
  expect(mergeRowUp(base, 'upfront', 0)).toEqual(base)
  expect(keysOf(mergeRowUp(base, 'upfront', 1).upfront)).toEqual([['distance','mapLink','raceTypes']])
})
test('splitToNewRow pulls a field into its own row just after', () => {
  const t = splitToNewRow(base, 'mapLink')
  expect(keysOf(t.upfront)).toEqual([['distance'], ['mapLink'], ['raceTypes']])
})
test('ops never mutate the input', () => {
  const snapshot = JSON.parse(JSON.stringify(base))
  moveToField(base, 'distance', 'hidden'); setAlign(base,'distance','right'); mergeRowUp(base,'upfront',1)
  expect(base).toEqual(snapshot)
})
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run __tests__/cardLayoutOps.test.ts`
Expected: FAIL — module/exports missing.

- [ ] **Step 3: Implement the ops**

Implement each as a pure, deep-copied transform (e.g. start each op with `const next = structuredClone(t)` or map/spread). `moveToField` must first remove `key` from every row (dropping rows left empty) and from `hidden`, then place it. `normalizeTemplate` collects all placed keys, then appends any of the 15 `CardFieldKey`s not seen to `hidden`. Define `CARD_FIELD_LABELS` with: Description, Coaching notes, Distance & elevation, Last ran, Map link, Route map image, Route directions, Reason, Energy system, HR zone, RPE, Turnaround, Race types, Training phases, Author.

- [ ] **Step 4: Run to verify pass + commit**

Run: `npx vitest run __tests__/cardLayoutOps.test.ts` → PASS.
```bash
git add lib/cardLayoutOps.ts __tests__/cardLayoutOps.test.ts
git commit -m "feat(#505): pure card-layout edit ops + field labels"
```

---

### Task 2: `saveCardTemplate` server action

**Files:**
- Modify: `app/run-config/actions.ts` (add `saveCardTemplate`, mirroring `savePostTemplate` at :87)

**Interfaces:**
- Consumes: the same `authorizeWriteCaller` + `assertCanManageRun` gate used by `savePostTemplate`.
- Produces: `saveCardTemplate(runId: string, data: { cardTemplate: CardTemplate }): Promise<{ error?: string }>`.

- [ ] **Step 1: Implement, mirroring `savePostTemplate`**

```ts
export async function saveCardTemplate(
  runId: string, data: { cardTemplate: CardTemplate },
): Promise<{ error?: string }> {
  const caller = await authorizeWriteCaller()
  if ('error' in caller) return { error: caller.error }
  const guard = await assertCanManageRun(caller, runId)
  if (guard) return { error: guard }
  await sql`UPDATE runs SET card_template = ${JSON.stringify(data.cardTemplate)}::jsonb WHERE id = ${runId}`
  updateTag('tigerwolves-data')
  return {}
}
```
(Match the exact auth helper names/shape used by `savePostTemplate` in this file — read it first and copy its structure precisely.)

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.
```bash
git add app/run-config/actions.ts
git commit -m "feat(#505): leader-only saveCardTemplate server action"
```

---

### Task 3: `CardTemplateTab` editor component

**Files:**
- Create: `components/CardTemplateTab.tsx`

**Interfaces:**
- Consumes: `normalizeTemplate`, the ops, `CARD_FIELD_LABELS` (Task 1); `saveCardTemplate` (Task 2); `RunConfig` (for `id` + `cardTemplate`).
- Produces: `<CardTemplateTab runConfig={RunConfig} />`.

- [ ] **Step 1: Implement the editor (move-controls)**

- State: `const [template, setTemplate] = useState(() => normalizeTemplate(runConfig.cardTemplate))`.
- Render three sections — **Show upfront**, **When expanded**, **Hidden** — styled like the mockup (`docs/superpowers/plans/2026-10-10-story-1-card-layout-mockup.html`).
  - For each row in `upfront`/`expanded`: render its fields as chips (label from `CARD_FIELD_LABELS`), each chip with buttons: **section** (▲ upfront / ◐ expanded / ○ hidden — calls `moveToField`), **align** left/right (`setAlign`), **split to own row** (`splitToNewRow`). Each row carries **move up/down** (`moveRow`) and **merge up** (`mergeRowUp`) controls.
  - Hidden: chips with a button to send back to upfront/expanded (`moveToField`).
  - Every button does `setTemplate(op(template, …))`.
- `handleSave` (mirror `PostTemplateTab.handleSave` at :185): `startTransition`, call `saveCardTemplate(runConfig.id, { cardTemplate: template })`, set `saved`/`error`, **wrap in try/catch + `Sentry.captureException`** (repo guardrail). Show "Saved!" for 2s.
- Accessibility: `aria-label` on every icon-only button (repo guardrail); `touch-manipulation` on interactive elements.
- No live preview here (2c). A short line: "Changes show on your Library cards after you Save."

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit` → clean. (No unit test — node-env vitest can't render React; the logic it drives is the Task-1 ops, already tested. Verified on Preview in Task 5.)
```bash
git add components/CardTemplateTab.tsx
git commit -m "feat(#505): CardTemplateTab move-controls editor"
```

---

### Task 4: Mount the tab in `RunConfigClient`

**Files:**
- Modify: `components/RunConfigClient.tsx` (:11-37)

**Interfaces:**
- Consumes: `CardTemplateTab` (Task 3).

- [ ] **Step 1: Add the tab**

- Extend the union: `useState<'about' | 'template' | 'card-layout' | 'roster'>('about')`.
- Add to `TAB_LABELS`: `'card-layout': 'Card layout'`.
- Add the render branch. Keep it **mounted** (like `template`) so edit state survives tab switches:
```tsx
<div className={tab === 'card-layout' ? '' : 'hidden'}>
  <CardTemplateTab runConfig={runConfig} />
</div>
```
Confirm the tab-bar `.map` iterates the `TAB_LABELS` keys so the new tab button renders automatically.

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.
```bash
git add components/RunConfigClient.tsx
git commit -m "feat(#505): mount Card layout tab in Run Settings"
```

---

### Task 5: Verify on Preview (configure → save → Library reflects)

- [ ] **Step 1: Full suite + typecheck**

Run: `npm run test:unit` (ops + resolver + formatter + parse all green) and `npx tsc --noEmit`.

- [ ] **Step 2: Live verification on the Preview URL**

Signed in as the test leader on the PR's Preview URL:
1. Open Run Settings → **Card layout**. Confirm it loads the default (all fields placed, matching today's Library card).
2. Make changes exercising each op: move a field to Hidden; move one from Hidden to upfront; merge two fields onto one row; split them; flip an alignment to right; reorder two rows. Confirm the editor updates each time.
3. **Save** → "Saved!".
4. Go to **Library** ("Your run") → confirm the cards now reflect the saved layout (the moved/hidden/aligned/grouped fields), proving the end-to-end path (editor → `saveCardTemplate` → `card_template` → `getLeaderRun` → `resolveCardLayout` → `WorkoutCardBody`).
5. Reload Run Settings → Card layout shows the saved state (persistence).
Capture before/after Library screenshots in the PR.

- [ ] **Step 3: Apply the migration?**

None — `card_template` already exists (#500). No DB schema work in 2b.

---

## Self-Review

**1. Spec coverage (2b slice):** editor with visibility/rows/alignment via move-controls (Tasks 1,3) ✓; leader-only save (Task 2) ✓; mounted tab (Task 4) ✓; Library reflects saved layout end-to-end (Task 5) ✓. Live preview correctly deferred to 2c.

**2. Placeholder scan:** No vague steps. Component markup references the committed mockup + `PostTemplateTab` for exact patterns (concrete sources). The ops — the only real logic — are fully specified with TDD code.

**3. Type consistency:** ops signatures in Task 1 are consumed verbatim in Task 3; `saveCardTemplate(runId, {cardTemplate})` (Task 2) is called with that exact shape in Task 3; `CardTemplateTab` prop (Task 3) matches the mount in Task 4.

**4. Review Focus:** hidden round-trip, `mergeRowUp` index-0 no-op, `moveRow` edge clamp, missing-field→hidden, and save-failure handling each map to a Task-1 test or the Task-3 try/catch. Section non-empty.
