# Card Layout — Story 1: Data Model + Resolver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `runs.card_template` data model and a pure, unit-tested resolver that turns a saved (or default) card layout + a workout into ordered, aligned, value-present rows — shipping invisibly (the default reproduces today's card; nothing renders from it yet).

**Architecture:** One nullable JSONB column on `runs` (null = default layout, no backfill). A pure module `lib/cardLayout.ts` owns the field registry, the default template, and `resolveCardLayout(workout, layout) → ResolvedCard`. No DB reads, no React, no rendering in this story — those arrive in Story 2, which consumes this module.

**Tech Stack:** TypeScript, Postgres (Neon), vitest (node env). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-10-configurable-card-layout-design.md`

## Global Constraints

- Migrations are idempotent / replay-safe (`IF NOT EXISTS`), preserving the no-tracking-table invariant — the whole set must be a no-op on second run.
- The migration reaches four Neon branches over the feature's life: **Preview** (this PR), **test-data** (`br-tiny-darkness-at3q6q1y`), **production** (at merge), **demo-data** (at/after merge). This story applies it to Preview + test-data.
- `card_template` is **nullable**; `NULL` = default layout. No backfill of existing runs.
- Field key vocabulary is fixed to the placeable inventory in the spec; `name`, `type`, `category`, variant label, and screen chrome are NOT field keys (app-controlled).
- A migration-touching PR auto-trips the `data-model-change` label + merge checklist (`data-model-flag.yml`) — expected, not a failure.

## Review Focus

- **Workout missing a configured field's value** (e.g. MapMyRun workout, `mapImageUrl = null`, but `mapImage` is placed) → the field renders nothing; no empty row survives. (Task 3)
- **`layout === null`** (run never configured) → the documented default layout, which reproduces today's card including #411's upfront map link. (Task 3)
- **Saved layout references an unknown/removed key** → ignored, no throw. (Task 3)
- **Field present in the workout but absent from a saved (non-default) layout** → treated as hidden (never auto-surfaced). (Task 3)
- **Compound "distance" field** → `distanceMiles` / `elevationGainFeet` / `distTime` travel together as one placement; present if `distanceMiles != null`. (Task 3)

---

### Task 1: Migration — `runs.card_template JSONB`

**Files:**
- Create: `scripts/migrate-500.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: the `runs.card_template` column (JSONB, nullable) that Story 1 Task 2's type mirrors and Story 2 reads.

- [ ] **Step 1: Write the migration**

```sql
-- Story 1 of #423: per-run configurable card layout.
-- Nullable JSONB; NULL = default layout (lib/cardLayout.ts). No backfill —
-- existing runs render exactly as today until a leader saves a layout.
ALTER TABLE runs ADD COLUMN IF NOT EXISTS card_template JSONB;
```

- [ ] **Step 2: Apply to the PR's Preview Neon branch and verify**

Fetch the Preview branch connection string via the Neon REST API (project `purple-star-02119717`, branch `preview/<head-ref>`) per CLAUDE.md, then run the single `ALTER` against it. Verify:

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'runs' AND column_name = 'card_template';
```
Expected: one row, `card_template | jsonb`.

- [ ] **Step 3: Apply to the test-data branch (`br-tiny-darkness-at3q6q1y`) and verify**

Same `ALTER` + same `information_schema` check against the test-data branch host (`ep-fragrant-sunset`). This is the branch CI's `npm run test:unit`/`test:e2e` run against — without it, later DB-touching work goes red with "column does not exist."

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-500.sql
git commit -m "feat(#500): add runs.card_template JSONB column"
```

---

### Task 2: Types — `CardTemplate` and field keys

**Files:**
- Modify: `lib/data.ts` (add card-layout types; extend `RunConfig`)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `CardFieldKey` (string union, 15 keys), `FieldAlign` (`'left' | 'right'`), `CardFieldPlacement` (`{ key: CardFieldKey; align: FieldAlign }`), `CardRow` (`{ fields: CardFieldPlacement[] }`), `CardTemplate` (`{ version: 1; upfront: CardRow[]; expanded: CardRow[]; hidden: CardFieldKey[] }`).
  - `RunConfig.cardTemplate: CardTemplate | null`.

- [ ] **Step 1: Add the card-layout types to `lib/data.ts`**

Place near the other run-config types:

```ts
// #423: per-run card layout. Field keys are the placeable workout fields
// only — workout name/type/category and screen chrome are app-controlled, not keys.
export type CardFieldKey =
  | 'description' | 'coachingNotes' | 'distance' | 'lastRan' | 'mapLink'
  | 'mapImage' | 'routeNarrative' | 'reason' | 'energySystem' | 'hrZone'
  | 'rpe' | 'turnaround' | 'raceTypes' | 'trainingPhases' | 'author'

export type FieldAlign = 'left' | 'right'
export type CardFieldPlacement = { key: CardFieldKey; align: FieldAlign }
export type CardRow = { fields: CardFieldPlacement[] }
export type CardTemplate = {
  version: 1
  upfront: CardRow[]   // ordered rows shown on the collapsed card
  expanded: CardRow[]  // ordered rows shown under "Show details"
  hidden: CardFieldKey[]
}
```

- [ ] **Step 2: Extend `RunConfig`**

Add after `postTemplate` in the `RunConfig` type:

```ts
  // #423: per-run card layout. NULL = default layout (lib/cardLayout.ts),
  // no backfill — existing runs render as today until a leader saves one.
  cardTemplate: CardTemplate | null
```

- [ ] **Step 3: Satisfy the compiler at existing `RunConfig` construction sites**

`getLeaderRun` and `getRunById` (lib/db.ts) and any `RunConfig` test fixtures (e.g. `__tests__/postBuilder.test.ts`) now need `cardTemplate`. For this story, default them to `null` at every construction site so the project type-checks; Story 2 wires the real DB read.

Run: `npx tsc --noEmit`
Expected: no errors. Fix each "property 'cardTemplate' is missing" by adding `cardTemplate: null`.

- [ ] **Step 4: Commit**

```bash
git add lib/data.ts lib/db.ts __tests__/postBuilder.test.ts
git commit -m "feat(#500): add CardTemplate types + RunConfig.cardTemplate"
```

---

### Task 3: Resolver + default layout (`lib/cardLayout.ts`)

**Files:**
- Create: `lib/cardLayout.ts`
- Test: `__tests__/cardLayout.test.ts`

**Interfaces:**
- Consumes: `WorkoutVariantRow`, `CardTemplate`, `CardFieldKey` from `lib/data.ts`.
- Produces:
  - `DEFAULT_CARD_TEMPLATE: CardTemplate` — reproduces today's card.
  - `hasValue(w: WorkoutVariantRow, key: CardFieldKey): boolean` — field presence.
  - `resolveCardLayout(w: WorkoutVariantRow, layout: CardTemplate | null): ResolvedCard`
  - `ResolvedField = { key: CardFieldKey }`, `ResolvedRow = { left: ResolvedField[]; right: ResolvedField[] }`, `ResolvedCard = { upfront: ResolvedRow[]; expanded: ResolvedRow[] }`.

- [ ] **Step 1: Write failing tests for `hasValue`**

```ts
// __tests__/cardLayout.test.ts
import { describe, test, expect } from 'vitest'
import { hasValue, resolveCardLayout, DEFAULT_CARD_TEMPLATE } from '../lib/cardLayout'
import type { WorkoutVariantRow, CardTemplate } from '../lib/data'

// Minimal fixture with every placeable value PRESENT; override per test.
const full: WorkoutVariantRow = {
  id: 1, familyId: 1, name: 'Domino Park Loop', label: null, sortOrder: null,
  category: 'Quality', type: 'Broken Tempo' as WorkoutVariantRow['type'],
  reason: 'why', rawInput: '800m loops', distTime: '800m', energySystem: 'VO2',
  hrZone: 'Z4', rpe: '8', coachingNotes: 'stay honest', mapLink: 'http://map',
  distanceMiles: 4, elevationGainFeet: 520, geometry: null,
  mapImageUrl: 'http://img', routeNarrative: 'turn left', author: 'Sal',
  raceTypes: ['5K'], trainingPhases: ['Build'], hasTurnaround: true,
  turnaround: 'after rep 2', flagged: false, flagNote: '', runGroupId: 1,
  lastRan: '2026-09-30',
}

describe('hasValue', () => {
  test('present fields report true', () => {
    for (const k of ['description','coachingNotes','distance','lastRan','mapLink',
      'mapImage','routeNarrative','reason','energySystem','hrZone','rpe',
      'turnaround','raceTypes','trainingPhases','author'] as const) {
      expect(hasValue(full, k)).toBe(true)
    }
  })
  test('empty/absent values report false', () => {
    expect(hasValue({ ...full, mapImageUrl: null }, 'mapImage')).toBe(false)
    expect(hasValue({ ...full, lastRan: null }, 'lastRan')).toBe(false)
    expect(hasValue({ ...full, author: null }, 'author')).toBe(false)
    expect(hasValue({ ...full, raceTypes: [] }, 'raceTypes')).toBe(false)
    expect(hasValue({ ...full, distanceMiles: null }, 'distance')).toBe(false)
    expect(hasValue({ ...full, coachingNotes: null }, 'coachingNotes')).toBe(false)
    expect(hasValue({ ...full, rawInput: '' }, 'description')).toBe(false)
    expect(hasValue({ ...full, hasTurnaround: false }, 'turnaround')).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/cardLayout.test.ts`
Expected: FAIL — `hasValue`/`resolveCardLayout`/`DEFAULT_CARD_TEMPLATE` not exported.

- [ ] **Step 3: Implement the field registry + `hasValue`**

```ts
// lib/cardLayout.ts
import type { WorkoutVariantRow, CardTemplate, CardFieldKey } from './data'

// Presence predicate per placeable field. "description" maps to rawInput — the
// free-form workout description block on today's card (confirm against
// LibraryClient render during Story 2 wiring; the key name stays stable either way).
const PRESENCE: Record<CardFieldKey, (w: WorkoutVariantRow) => boolean> = {
  description:    w => !!w.rawInput?.trim(),
  coachingNotes:  w => !!w.coachingNotes?.trim(),
  distance:       w => w.distanceMiles != null,
  lastRan:        w => w.lastRan != null,
  mapLink:        w => !!w.mapLink,
  mapImage:       w => !!w.mapImageUrl,
  routeNarrative: w => !!w.routeNarrative?.trim(),
  reason:         w => !!w.reason?.trim(),
  energySystem:   w => !!w.energySystem?.trim(),
  hrZone:         w => !!w.hrZone?.trim(),
  rpe:            w => !!w.rpe?.trim(),
  turnaround:     w => w.hasTurnaround && !!w.turnaround?.trim(),
  raceTypes:      w => w.raceTypes.length > 0,
  trainingPhases: w => w.trainingPhases.length > 0,
  author:         w => !!w.author,
}

export function hasValue(w: WorkoutVariantRow, key: CardFieldKey): boolean {
  return PRESENCE[key]?.(w) ?? false
}
```

- [ ] **Step 4: Run to verify `hasValue` tests pass**

Run: `npx vitest run __tests__/cardLayout.test.ts -t hasValue`
Expected: PASS.

- [ ] **Step 5: Write failing tests for `DEFAULT_CARD_TEMPLATE` + `resolveCardLayout`**

```ts
describe('resolveCardLayout', () => {
  const flatKeys = (rows: { left: {key:string}[]; right: {key:string}[] }[]) =>
    rows.flatMap(r => [...r.left, ...r.right].map(f => f.key))

  test('null layout uses the default (map link upfront, per #411)', () => {
    const r = resolveCardLayout(full, null)
    expect(flatKeys(r.upfront)).toContain('mapLink')
    expect(flatKeys(r.upfront)).toContain('distance')
    expect(flatKeys(r.expanded)).toContain('reason')
  })

  test('empty-value fields are skipped and empty rows dropped', () => {
    const noMapImg = { ...full, mapImageUrl: null }
    const layout: CardTemplate = {
      version: 1,
      upfront: [{ fields: [{ key: 'mapImage', align: 'left' }] },
                { fields: [{ key: 'distance', align: 'left' }] }],
      expanded: [], hidden: [],
    }
    const r = resolveCardLayout(noMapImg, layout)
    expect(flatKeys(r.upfront)).toEqual(['distance'])       // mapImage row dropped
  })

  test('left/right alignment routes fields into the right group', () => {
    const layout: CardTemplate = {
      version: 1,
      upfront: [{ fields: [{ key: 'distance', align: 'left' },
                           { key: 'mapLink', align: 'right' }] }],
      expanded: [], hidden: [],
    }
    const r = resolveCardLayout(full, layout)
    expect(r.upfront[0].left.map(f => f.key)).toEqual(['distance'])
    expect(r.upfront[0].right.map(f => f.key)).toEqual(['mapLink'])
  })

  test('unknown key in a saved layout is ignored (no throw)', () => {
    const layout = { version: 1, upfront: [{ fields: [
      { key: 'bogus', align: 'left' }, { key: 'distance', align: 'left' }] }],
      expanded: [], hidden: [] } as unknown as CardTemplate
    const r = resolveCardLayout(full, layout)
    expect(flatKeys(r.upfront)).toEqual(['distance'])
  })

  test('present field unlisted in a saved layout is NOT auto-surfaced', () => {
    const layout: CardTemplate = {
      version: 1,
      upfront: [{ fields: [{ key: 'distance', align: 'left' }] }],
      expanded: [], hidden: [],
    }
    const r = resolveCardLayout(full, layout) // author present but unlisted
    expect([...flatKeys(r.upfront), ...flatKeys(r.expanded)]).not.toContain('author')
  })
})
```

- [ ] **Step 6: Run to verify the new tests fail**

Run: `npx vitest run __tests__/cardLayout.test.ts`
Expected: FAIL — `resolveCardLayout`/`DEFAULT_CARD_TEMPLATE` not implemented.

- [ ] **Step 7: Implement `DEFAULT_CARD_TEMPLATE` + `resolveCardLayout`**

```ts
// Reproduces today's card: description + coaching notes, then a stats row
// (distance/last-ran left, map link right per #411), then classification pills;
// the rest behind "Show details". Verify visually against the live card in Story 2.
export const DEFAULT_CARD_TEMPLATE: CardTemplate = {
  version: 1,
  upfront: [
    { fields: [{ key: 'description', align: 'left' }] },
    { fields: [{ key: 'coachingNotes', align: 'left' }] },
    { fields: [{ key: 'distance', align: 'left' }, { key: 'lastRan', align: 'left' },
               { key: 'mapLink', align: 'right' }] },
    { fields: [{ key: 'raceTypes', align: 'left' }, { key: 'trainingPhases', align: 'left' }] },
    { fields: [{ key: 'author', align: 'left' }] },
  ],
  expanded: [
    { fields: [{ key: 'reason', align: 'left' }] },
    { fields: [{ key: 'energySystem', align: 'left' }, { key: 'hrZone', align: 'left' }] },
    { fields: [{ key: 'rpe', align: 'left' }] },
    { fields: [{ key: 'turnaround', align: 'left' }] },
    { fields: [{ key: 'routeNarrative', align: 'left' }] },
    { fields: [{ key: 'mapImage', align: 'left' }] },
  ],
  hidden: [],
}

export type ResolvedField = { key: CardFieldKey }
export type ResolvedRow = { left: ResolvedField[]; right: ResolvedField[] }
export type ResolvedCard = { upfront: ResolvedRow[]; expanded: ResolvedRow[] }

const KNOWN = new Set<CardFieldKey>(Object.keys(PRESENCE) as CardFieldKey[])

function resolveSection(w: WorkoutVariantRow, rows: CardTemplate['upfront']): ResolvedRow[] {
  const out: ResolvedRow[] = []
  for (const row of rows) {
    const left: ResolvedField[] = []
    const right: ResolvedField[] = []
    for (const p of row.fields) {
      if (!KNOWN.has(p.key)) continue          // unknown key → ignore
      if (!hasValue(w, p.key)) continue         // empty value → skip
      ;(p.align === 'right' ? right : left).push({ key: p.key })
    }
    if (left.length || right.length) out.push({ left, right })  // drop empty rows
  }
  return out
}

export function resolveCardLayout(
  w: WorkoutVariantRow, layout: CardTemplate | null,
): ResolvedCard {
  const t = layout ?? DEFAULT_CARD_TEMPLATE
  return { upfront: resolveSection(w, t.upfront), expanded: resolveSection(w, t.expanded) }
}
```

- [ ] **Step 8: Run the full resolver test file to verify it passes**

Run: `npx vitest run __tests__/cardLayout.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 9: Typecheck and commit**

Run: `npx tsc --noEmit` → no errors.

```bash
git add lib/cardLayout.ts __tests__/cardLayout.test.ts
git commit -m "feat(#500): pure card-layout resolver + default template"
```

---

## Self-Review

**1. Spec coverage (Story-1 slice):**
- `runs.card_template JSONB` nullable, no backfill → Task 1. ✓
- `CardTemplate` shape (version/upfront/expanded/hidden, rows of `{key,align}`) → Task 2. ✓
- Pure resolver, empty-skip, null→default, unknown-key ignore, unlisted→hidden, compound distance → Task 3 + tests. ✓
- Default reproduces today's card incl. #411 map link → `DEFAULT_CARD_TEMPLATE`. ✓ (visual confirmation deferred to Story 2, noted inline.)
- Deferred to later stories (correctly out of this plan): editor, preview, DB read wiring, surface rendering.

**2. Placeholder scan:** The only deferred items are (a) migration filename's issue number — resolved at PUBLISH when the story issue is filed, convention stated; (b) the `description`→`rawInput` mapping, flagged inline for visual confirmation in Story 2. Neither is a vague requirement; both have concrete instructions. No "TODO/handle edge cases/add validation" placeholders.

**3. Type consistency:** `CardTemplate`/`CardFieldKey`/`CardFieldPlacement`/`CardRow` defined in Task 2 are consumed verbatim in Task 3; `ResolvedCard`/`ResolvedRow`/`ResolvedField` defined and used only in Task 3. `resolveCardLayout`/`hasValue`/`DEFAULT_CARD_TEMPLATE` signatures match the Interfaces block.

**4. Review Focus:** Each of the five listed inputs has a Task 3 test (empty-skip, null→default, unknown-key, unlisted→hidden, compound distance). Section non-empty.
