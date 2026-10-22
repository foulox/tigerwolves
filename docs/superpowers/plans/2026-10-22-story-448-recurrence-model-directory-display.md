# Recurrence model + directory display (RRULE) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach the app each run's real cadence (via an RFC 5545 RRULE per run) so the five monthly food runs stop showing every Friday in All Runs and instead appear only on the week they actually occur, with a cadence label.

**Architecture:** One pure seam, `lib/recurrence.ts`, wraps `rrule.js` to answer "does this run occur on date D?" (`occursOn`), "which dates in [start,end]?" (`occurrencesBetween`), and "what's the human cadence label?" (`describeRecurrence`). A run with no rule defaults to weekly-on-`day_of_week` (back-compat for the ~19 weekly runs). The seam runs **server-side only** — the All Runs page (`app/all-runs/page.tsx`) expands each run over its 7-day window and hands the client a precomputed `occurrenceDates` list + `cadenceLabel` per run, so `rrule.js` never ships to the browser. `AllRunsClient` places a card under a day only when that day is in the card's `occurrenceDates`, and renders the label on non-weekly runs.

**Tech Stack:** TypeScript, Next.js (App Router, RSC), `rrule` (new dependency), Postgres (Neon) via `@neondatabase/serverless` tagged-template `sql`, vitest.

**Spec:** `docs/superpowers/specs/2026-09-26-run-recurrence-rrule-design.md` (Structure + Story 1). This plan implements **story 1 only** (#448): model + directory display, rules seeded directly, no AI, no schedule-generation change (that's #449).

## Global Constraints

- **New dependency `rrule`** — pure JS, no peer deps. Server-side use only; must not be imported into any `'use client'` module.
- **Migrations are idempotent / replay-safe** — `ADD COLUMN IF NOT EXISTS`, seed guarded so re-running is a no-op. No migration-tracking table exists; `scripts/run-migrate.ts` replays the whole set every time. A non-idempotent migration turns the demo-schema auto-sync red on the next merge.
- **Migration numbering** — next free number is `migrate-502.sql` (latest is `migrate-501.sql`). `sortMigrationFiles` orders by the numeric suffix.
- **`occursOn` and all date math use UTC** (`Date.UTC`, `getUTCDay`) — `rrule.js` is timezone-sensitive; UTC-anchored dtstart + UTC query dates keep the predicate deterministic and sidestep DST. The app already assumes a single NYC timezone for display; this constraint is about the predicate's internal arithmetic, not display.
- **Weekly runs are unaffected** — a run with `rrule = NULL` must behave exactly as today (shows on its `day_of_week` every week, no cadence label).
- **`updateTag`/cache:** this story adds no new write paths; `getDirectoryRuns` is an uncached read, so no cache-invalidation work. Do not introduce `revalidateTag`.
- **A schema migration must be applied to its own PR's Preview Neon branch AND the test-data branch** (`br-tiny-darkness-at3q6q1y`) before the build is called done — CI runs `test:unit` against test-data, not Preview. Verify by querying the target DB that the columns/seed exist; a self-reported "done" is insufficient (per CLAUDE.md Development rules).

## Review Focus

Inputs the spec implies but the happy-path tests won't exercise, most-likely-to-bite first. Each gets a test pinned to the owning task.

- **A stored RRULE that `rrule.js` can't parse** (hand-edited / future bad write) must not 500 the whole All Runs page — the directory read should fall back (treat as weekly default) and the page still render. → test in Task 3.
- **`BYDAY=5FR` in a month with only four Fridays** — the run must produce *no* occurrence that month, not silently fall to the 4th. → test in Task 1.
- **A run with both `day_of_week = NULL` and `rrule = NULL`** — `occursOn` returns false for every date instead of throwing. → test in Task 1.
- **A `dtstart` whose weekday differs from the rule's `BYDAY`** — occurrences must follow the rule, not the anchor's weekday. → test in Task 1.
- **A date exactly on a DST boundary** (e.g. 2026-03-08, US spring-forward) — `occursOn` returns the same answer it would off-boundary, because arithmetic is UTC. → test in Task 1.

---

## File Structure

- **Create** `lib/recurrence.ts` — the seam. Pure functions over a minimal `RecurrenceRun` shape; wraps `rrule`. No DB, no React.
- **Create** `scripts/migrate-502.sql` — add `rrule`/`rrule_dtstart` columns; seed the five food runs' rules.
- **Modify** `lib/db.ts` — extend `DirectoryRun` type + `getDirectoryRuns` SELECT with `rrule`, `rrule_dtstart`.
- **Modify** `app/all-runs/page.tsx` — compute the 7-day window; attach `occurrenceDates` + `cadenceLabel` per run via the seam.
- **Modify** `lib/allRuns.ts` — extend `DirectoryRunInput`/`DirectoryCard` with `occurrenceDates: string[]` + `cadenceLabel: string | null`; pass them through `directoryRunToCard`.
- **Modify** `components/AllRunsClient.tsx` — gate day-block placement on `occurrenceDates`; render the cadence label on non-weekly cards.
- **Create** `__tests__/recurrence.test.ts`, extend `__tests__/allRuns.test.ts`.

---

### Task 1: The recurrence seam (`lib/recurrence.ts`)

**Files:**
- Create: `lib/recurrence.ts`
- Test: `__tests__/recurrence.test.ts`
- Modify: `package.json` (add `rrule`)

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces:
  - `type RecurrenceRun = { rrule: string | null; dtstart: string | null; dayOfWeek: string | null }`
  - `occursOn(run: RecurrenceRun, ymd: string): boolean`
  - `occurrencesBetween(run: RecurrenceRun, startYmd: string, endYmd: string): string[]` — inclusive, ascending YMD strings.
  - `describeRecurrence(run: RecurrenceRun): string | null` — `null` when the run has no `rrule` (weekly default); otherwise `rrule.js` `toText()`.

- [ ] **Step 1: Add the dependency**

```bash
npm install rrule
```

Confirm it landed:

```bash
cat package.json | jq '.dependencies.rrule'   # expect a version string, not null
```

- [ ] **Step 2: Commit the dependency**

```bash
git add package.json package-lock.json
git commit -m "chore(#448): add rrule dependency for recurrence seam"
```

- [ ] **Step 3: Write failing tests for `occursOn`**

```ts
// __tests__/recurrence.test.ts
import { describe, it, expect } from 'vitest'
import { occursOn, occurrencesBetween, describeRecurrence } from '../lib/recurrence'

// Weekly-default (no rrule) falls back to day_of_week.
const weeklyTue = { rrule: null, dtstart: null, dayOfWeek: 'Tuesday' }
// Second-Friday-monthly, anchored on a Friday that is NOT the 2nd Friday,
// to prove the rule — not the anchor's weekday-position — drives occurrence.
const secondFri = { rrule: 'FREQ=MONTHLY;BYDAY=2FR', dtstart: '2020-01-03', dayOfWeek: 'Friday' }
// Fifth-Friday-monthly: most months have no 5th Friday.
const fifthFri = { rrule: 'FREQ=MONTHLY;BYDAY=5FR', dtstart: '2020-01-03', dayOfWeek: 'Friday' }
// Every-other-Tuesday, phase anchored 2026-09-29 (a Tuesday).
const biweeklyTue = { rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU', dtstart: '2026-09-29', dayOfWeek: 'Tuesday' }

describe('occursOn — weekly default (null rrule)', () => {
  it('occurs on its day_of_week every week', () => {
    expect(occursOn(weeklyTue, '2026-10-20')).toBe(true)  // Tuesday
    expect(occursOn(weeklyTue, '2026-10-27')).toBe(true)  // next Tuesday
  })
  it('does not occur on other weekdays', () => {
    expect(occursOn(weeklyTue, '2026-10-21')).toBe(false) // Wednesday
  })
  it('returns false when both rrule and day_of_week are null', () => {
    expect(occursOn({ rrule: null, dtstart: null, dayOfWeek: null }, '2026-10-20')).toBe(false)
  })
})

describe('occursOn — monthly nth weekday', () => {
  it('occurs only on the 2nd Friday', () => {
    expect(occursOn(secondFri, '2026-10-09')).toBe(true)  // 2nd Friday of Oct 2026
    expect(occursOn(secondFri, '2026-10-02')).toBe(false) // 1st Friday
    expect(occursOn(secondFri, '2026-10-16')).toBe(false) // 3rd Friday
  })
  it('follows the rule, not the dtstart weekday-position', () => {
    // dtstart 2020-01-03 is the 1st Friday of Jan 2020; rule still means 2nd Friday.
    expect(occursOn(secondFri, '2020-01-10')).toBe(true)  // 2nd Friday Jan 2020
    expect(occursOn(secondFri, '2020-01-03')).toBe(false) // the anchor itself (1st Friday)
  })
  it('produces no occurrence in a month without a 5th Friday', () => {
    // Oct 2026 has 5 Fridays (2,9,16,23,30); Nov 2026 has only 4.
    expect(occursOn(fifthFri, '2026-10-30')).toBe(true)
    expect(occursOn(fifthFri, '2026-11-27')).toBe(false) // 4th & last Friday of Nov
  })
})

describe('occursOn — one-time (COUNT=1)', () => {
  const onceOnly = { rrule: 'FREQ=DAILY;COUNT=1', dtstart: '2026-11-05', dayOfWeek: 'Thursday' }
  it('occurs only on its single anchored date', () => {
    expect(occursOn(onceOnly, '2026-11-05')).toBe(true)
    expect(occursOn(onceOnly, '2026-11-12')).toBe(false)
    expect(occursOn(onceOnly, '2026-11-06')).toBe(false)
  })
})

describe('occursOn — biweekly phase + DST', () => {
  it('respects the every-other-week phase from dtstart', () => {
    expect(occursOn(biweeklyTue, '2026-09-29')).toBe(true)
    expect(occursOn(biweeklyTue, '2026-10-06')).toBe(false) // odd week
    expect(occursOn(biweeklyTue, '2026-10-13')).toBe(true)  // even week
  })
  it('is stable across a US DST boundary (arithmetic is UTC)', () => {
    // 2026-03-08 is US spring-forward; a Sunday, so a Tuesday rule must still say false,
    // and the following Tuesday true — no off-by-one from the clock shift.
    const weeklySun = { rrule: null, dtstart: null, dayOfWeek: 'Sunday' }
    expect(occursOn(weeklySun, '2026-03-08')).toBe(true)
    expect(occursOn(weeklyTue, '2026-03-10')).toBe(true)
  })
})

describe('occurrencesBetween', () => {
  it('lists weekly-default occurrences inclusive of both ends', () => {
    expect(occurrencesBetween(weeklyTue, '2026-10-19', '2026-10-27')).toEqual(['2026-10-20', '2026-10-27'])
  })
  it('lists only the matching monthly date inside a window', () => {
    expect(occurrencesBetween(secondFri, '2026-10-05', '2026-10-11')).toEqual(['2026-10-09'])
    expect(occurrencesBetween(secondFri, '2026-10-12', '2026-10-18')).toEqual([])
  })
})

describe('describeRecurrence', () => {
  it('returns null for a weekly-default run (no rrule)', () => {
    expect(describeRecurrence(weeklyTue)).toBeNull()
  })
  it('renders a human label for a monthly rule', () => {
    // rrule.js toText wording; assert the meaningful tokens rather than exact punctuation.
    const text = describeRecurrence(secondFri)!
    expect(text.toLowerCase()).toContain('month')
    expect(text.toLowerCase()).toContain('2nd')
    expect(text.toLowerCase()).toContain('friday')
  })
})
```

- [ ] **Step 4: Run tests, verify they fail**

Run: `npx vitest run __tests__/recurrence.test.ts`
Expected: FAIL — `lib/recurrence.ts` does not exist / functions undefined.

- [ ] **Step 5: Implement `lib/recurrence.ts`**

```ts
// lib/recurrence.ts
// #448: the single recurrence seam. Wraps rrule.js so display (#448),
// schedule generation (#449), and retire filtering reuse ONE occurrence
// predicate. A run with no `rrule` defaults to weekly-on-`day_of_week`
// (back-compat). Server-side only — do NOT import from a 'use client' module.
//
// All arithmetic is UTC: rrule.js is timezone-sensitive, so we anchor dtstart
// at UTC midnight and query with UTC-midnight dates, keeping the predicate
// deterministic regardless of the server's local zone or DST.
import { RRule } from 'rrule'

export type RecurrenceRun = {
  rrule: string | null
  dtstart: string | null
  dayOfWeek: string | null
}

const DOW_TO_UTCDAY: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
}

// "2026-10-09" -> Date at UTC midnight. Avoids local-tz drift.
function utcMidnight(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function toYmd(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Build an RRule from the stored rule + anchor. Throws if rrule.js rejects
// either — callers that read untrusted stored values must catch.
function buildRule(rruleStr: string, dtstart: string): RRule {
  const options = RRule.parseString(rruleStr)
  options.dtstart = utcMidnight(dtstart)
  return new RRule(options)
}

export function occursOn(run: RecurrenceRun, ymd: string): boolean {
  if (!run.rrule) {
    // Weekly default: occurs iff the date's weekday matches day_of_week.
    if (!run.dayOfWeek) return false
    const target = DOW_TO_UTCDAY[run.dayOfWeek]
    if (target === undefined) return false
    return utcMidnight(ymd).getUTCDay() === target
  }
  const rule = buildRule(run.rrule, run.dtstart ?? ymd)
  const day = utcMidnight(ymd)
  return rule.between(day, day, true).length > 0
}

export function occurrencesBetween(
  run: RecurrenceRun,
  startYmd: string,
  endYmd: string,
): string[] {
  if (!run.rrule) {
    // Enumerate matching weekdays in the window without rrule.js.
    if (!run.dayOfWeek || DOW_TO_UTCDAY[run.dayOfWeek] === undefined) return []
    const out: string[] = []
    for (let d = utcMidnight(startYmd); toYmd(d) <= endYmd; d.setUTCDate(d.getUTCDate() + 1)) {
      if (d.getUTCDay() === DOW_TO_UTCDAY[run.dayOfWeek]) out.push(toYmd(d))
    }
    return out
  }
  const rule = buildRule(run.rrule, run.dtstart ?? startYmd)
  return rule.between(utcMidnight(startYmd), utcMidnight(endYmd), true).map(toYmd)
}

export function describeRecurrence(run: RecurrenceRun): string | null {
  if (!run.rrule) return null // weekly default — no label (would be noise on ~19 runs)
  return buildRule(run.rrule, run.dtstart ?? '2020-01-01').toText()
}
```

- [ ] **Step 6: Run tests, verify they pass**

Run: `npx vitest run __tests__/recurrence.test.ts`
Expected: PASS (all cases).

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add lib/recurrence.ts __tests__/recurrence.test.ts
git commit -m "feat(#448): recurrence seam (occursOn/occurrencesBetween/describeRecurrence)"
```

---

### Task 2: Schema migration + seed the food-run rules (`migrate-502.sql`)

**Files:**
- Create: `scripts/migrate-502.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `runs.rrule TEXT` (null ⇒ weekly default) and `runs.rrule_dtstart DATE` on the live schema, with the five food runs carrying their monthly rules.

The five food runs and their rules (from `migrate-446.sql`, derived from each run's name):

| id | rule | `rrule_dtstart` |
|---|---|---|
| `first-friday-salmon-run` | `FREQ=MONTHLY;BYDAY=1FR` | `2020-01-03` |
| `second-friday-donut-run` | `FREQ=MONTHLY;BYDAY=2FR` | `2020-01-03` |
| `third-friday-ice-cream-run` | `FREQ=MONTHLY;BYDAY=3FR` | `2020-01-03` |
| `fourth-friday-bagel-run` | `FREQ=MONTHLY;BYDAY=4FR` | `2020-01-03` |
| `second-friday-brewery-run` | `FREQ=MONTHLY;BYDAY=2FR` | `2020-01-03` |

(`2020-01-03` is a Friday used as a neutral shared anchor; the monthly rule — not the anchor — drives occurrence, as Task 1's test proves.)

- [ ] **Step 1: Write the migration**

```sql
-- scripts/migrate-502.sql
-- #448: per-run recurrence (RRULE). Add the rule + anchor columns and seed the
-- five monthly food runs so they stop rendering every Friday. Null rrule ⇒ the
-- app's weekly-on-day_of_week default (back-compat for all other runs).
-- Idempotent: ADD ... IF NOT EXISTS; constant UPDATEs are replay-safe no-ops.

ALTER TABLE runs ADD COLUMN IF NOT EXISTS rrule TEXT;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS rrule_dtstart DATE;

UPDATE runs SET rrule = 'FREQ=MONTHLY;BYDAY=1FR', rrule_dtstart = '2020-01-03' WHERE id = 'first-friday-salmon-run';
UPDATE runs SET rrule = 'FREQ=MONTHLY;BYDAY=2FR', rrule_dtstart = '2020-01-03' WHERE id = 'second-friday-donut-run';
UPDATE runs SET rrule = 'FREQ=MONTHLY;BYDAY=3FR', rrule_dtstart = '2020-01-03' WHERE id = 'third-friday-ice-cream-run';
UPDATE runs SET rrule = 'FREQ=MONTHLY;BYDAY=4FR', rrule_dtstart = '2020-01-03' WHERE id = 'fourth-friday-bagel-run';
UPDATE runs SET rrule = 'FREQ=MONTHLY;BYDAY=2FR', rrule_dtstart = '2020-01-03' WHERE id = 'second-friday-brewery-run';
```

- [ ] **Step 2: Apply to the test-data branch and verify by query**

CI runs `test:unit` against test-data (`br-tiny-darkness-at3q6q1y`, host `ep-fragrant-sunset`), so this must happen before Task 3's DB-touching tests and before CI. Fetch the test-data connection string via the Neon REST API (token in `.env.local` `NEON_API_KEY`; project `purple-star-02119717`; pattern in CLAUDE.md — do NOT run `neonctl auth`), then:

```bash
DATABASE_URL='<test-data-connection-string>' MIGRATE_ONLY_HOST=ep-fragrant-sunset npx tsx scripts/run-migrate.ts
```

Verify the columns and seed landed (not a self-reported "done"):

```bash
DATABASE_URL='<test-data-connection-string>' npx tsx -e "
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
const rows = await sql\`SELECT id, rrule, rrule_dtstart FROM runs WHERE rrule IS NOT NULL ORDER BY id\`;
console.table(rows);
"
```
Expected: exactly the five food-run rows with their rules above; `rrule_dtstart` = 2020-01-03 on each.

- [ ] **Step 3: Apply to this PR's Preview Neon branch and verify**

After the branch is pushed and the Preview Neon branch exists (`preview/<branch>`), fetch its connection string the same way and run the same `run-migrate` + verify query against it. Preview must never be left with the old schema while the code expects the new columns.

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-502.sql
git commit -m "feat(#448): migration — rrule/rrule_dtstart columns + seed food-run rules"
```

> Production (`br-square-river-atjn0mzq`) and demo-data (`br-little-rice-at9l08ja`) are applied at/after merge (plain migrate apply, no `refresh-demo.ts` needed) — Lou's timing call, noted in the PR's Manual steps. The PR will be auto-flagged `data-model-change`; this migration is additive/idempotent, so demo-schema auto-sync on merge is safe.

---

### Task 3: Expand recurrence into the directory read (`lib/db.ts`, `app/all-runs/page.tsx`, `lib/allRuns.ts`)

**Files:**
- Modify: `lib/db.ts` (`DirectoryRun` type + `getDirectoryRuns` SELECT)
- Modify: `app/all-runs/page.tsx` (compute window + attach occurrences/label)
- Modify: `lib/allRuns.ts` (`DirectoryRunInput`/`DirectoryCard` + `directoryRunToCard`)
- Test: `__tests__/allRuns.test.ts` (extend)

**Interfaces:**
- Consumes: `occurrencesBetween`, `describeRecurrence` from Task 1; `rrule`/`rrule_dtstart` columns from Task 2.
- Produces:
  - `DirectoryRun` gains `rrule: string | null`, `rrule_dtstart: string | null`.
  - `DirectoryCard` (and `DirectoryRunInput`) gain `occurrenceDates: string[]`, `cadenceLabel: string | null`.
  - A helper `directoryWindowYmds(serverDate: string): string[]` (exported from `lib/allRuns.ts`) returning the 7 YMD strings `[serverDate .. serverDate+6]`, used by both the page (to expand occurrences) and shared with the client's day layout.

- [ ] **Step 1: Extend `DirectoryRun` + `getDirectoryRuns`**

In `lib/db.ts`, add to the `DirectoryRun` type:

```ts
  rrule: string | null
  rrule_dtstart: string | null
```

Update the SELECT and the row map in `getDirectoryRuns`:

```ts
  const rows = await sql`
    SELECT id, name, day_of_week, meeting_time, meeting_location, kind, emoji, status, distance,
           rrule, rrule_dtstart::text AS rrule_dtstart
    FROM runs ORDER BY id
  `
  return rows.map(r => ({
    // ...existing fields...
    rrule: (r.rrule as string | null) ?? null,
    rrule_dtstart: (r.rrule_dtstart as string | null) ?? null,
  }))
```
(`::text` casts the DATE to a `YYYY-MM-DD` string so it matches `RecurrenceRun.dtstart`.)

- [ ] **Step 2: Write failing tests for the window helper + card enrichment**

Add to `__tests__/allRuns.test.ts`:

```ts
import { directoryWindowYmds, directoryRunToCard } from '../lib/allRuns'

describe('directoryWindowYmds', () => {
  it('returns 7 consecutive YMDs starting at serverDate', () => {
    expect(directoryWindowYmds('2026-10-20')).toEqual([
      '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23',
      '2026-10-24', '2026-10-25', '2026-10-26',
    ])
  })
})

describe('directoryRunToCard — recurrence passthrough', () => {
  const base = {
    id: 'second-friday-donut-run', name: 'Second Friday Donut Run',
    day_of_week: 'Friday', meeting_time: '7:30am', meeting_location: 'X',
    kind: 'Food', emoji: null, distance: '3–4 mi', status: 'unclaimed' as const,
  }
  it('carries occurrenceDates and cadenceLabel onto the card', () => {
    const card = directoryRunToCard({
      ...base,
      occurrenceDates: ['2026-10-09'],
      cadenceLabel: 'every month on the 2nd Friday',
    })
    expect(card.occurrenceDates).toEqual(['2026-10-09'])
    expect(card.cadenceLabel).toContain('2nd')
  })
  it('defaults to empty occurrences and null label when omitted', () => {
    const card = directoryRunToCard({ ...base, occurrenceDates: [], cadenceLabel: null })
    expect(card.occurrenceDates).toEqual([])
    expect(card.cadenceLabel).toBeNull()
  })
})
```

- [ ] **Step 3: Run tests, verify they fail**

Run: `npx vitest run __tests__/allRuns.test.ts`
Expected: FAIL — `directoryWindowYmds` undefined; `DirectoryRunInput` lacks the new fields.

- [ ] **Step 4: Implement the helper + extend the card types**

In `lib/allRuns.ts`:

```ts
// #448: the 7 YMD strings the All Runs directory window spans, starting "today".
// Mirrors AllRunsClient's day layout so server-expanded occurrences line up with
// the day blocks the client renders. Pure string arithmetic — no Date tz drift.
export function directoryWindowYmds(serverDate: string): string[] {
  const [y, m, d] = serverDate.split('-').map(Number)
  const out: string[] = []
  for (let i = 0; i < 7; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d + i))
    out.push(
      `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`,
    )
  }
  return out
}
```

Add to `DirectoryRunInput`:

```ts
  occurrenceDates: string[]
  cadenceLabel: string | null
```

Pass them through in `directoryRunToCard`'s returned object:

```ts
    occurrenceDates: run.occurrenceDates,
    cadenceLabel: run.cadenceLabel,
```

And extend `DirectoryCard` so the client sees the fields:

```ts
export type DirectoryCard = NBRRun & {
  status: RunStatus
  occurrenceDates: string[]
  cadenceLabel: string | null
}
```

- [ ] **Step 5: Run tests, verify they pass**

Run: `npx vitest run __tests__/allRuns.test.ts`
Expected: PASS.

- [ ] **Step 6: Wire the page to expand occurrences server-side**

In `app/all-runs/page.tsx`, after `const dbRuns = await getDirectoryRuns()`, build the window and attach per-run occurrences + label. A malformed stored rule must not crash the page (Review Focus) — fall back to the weekly default:

```ts
import { occurrencesBetween, describeRecurrence } from '@/lib/recurrence'
import { directoryWindowYmds } from '@/lib/allRuns'
import * as Sentry from '@sentry/nextjs'

const windowYmds = directoryWindowYmds(serverDate)
const windowStart = windowYmds[0]
const windowEnd = windowYmds[windowYmds.length - 1]

const enrichedRuns = dbRuns.map(r => {
  const rec = { rrule: r.rrule, dtstart: r.rrule_dtstart, dayOfWeek: r.day_of_week }
  try {
    return {
      ...r,
      occurrenceDates: occurrencesBetween(rec, windowStart, windowEnd),
      cadenceLabel: describeRecurrence(rec),
    }
  } catch (err) {
    // A stored rule rrule.js can't parse must not 500 the directory — log and
    // fall back to the weekly default so the run still places on its day_of_week.
    Sentry.captureException(err)
    const fallback = { rrule: null, dtstart: null, dayOfWeek: r.day_of_week }
    return { ...r, occurrenceDates: occurrencesBetween(fallback, windowStart, windowEnd), cadenceLabel: null }
  }
})

const visibleRuns = enrichedRuns
```

Replace the existing `const visibleRuns = dbRuns` line with the above (the `runs={visibleRuns}` prop already flows to `AllRunsClient`).

- [ ] **Step 7: Write a failing test for the malformed-rule fallback**

Add to `__tests__/allRuns.test.ts` — the fallback is a pure branch, so test it against the seam directly to pin the behavior the page relies on:

```ts
import { occurrencesBetween } from '../lib/recurrence'

describe('malformed stored rule — directory fallback contract', () => {
  it('occurrencesBetween throws on a rule rrule.js cannot parse', () => {
    // 'FREQ=NONSENSE' → freq index -1 → `new RRule` throws. A reliably-rejected input.
    expect(() =>
      occurrencesBetween({ rrule: 'FREQ=NONSENSE', dtstart: '2020-01-03', dayOfWeek: 'Friday' }, '2026-10-19', '2026-10-25'),
    ).toThrow()
  })
  it('the weekly-default fallback still places the run on its day_of_week', () => {
    expect(
      occurrencesBetween({ rrule: null, dtstart: null, dayOfWeek: 'Friday' }, '2026-10-19', '2026-10-25'),
    ).toEqual(['2026-10-23'])
  })
})
```

- [ ] **Step 8: Run the full unit suite + typecheck**

Run: `npx vitest run __tests__/recurrence.test.ts __tests__/allRuns.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add lib/db.ts app/all-runs/page.tsx lib/allRuns.ts __tests__/allRuns.test.ts
git commit -m "feat(#448): expand run recurrence server-side for the All Runs window"
```

---

### Task 4: Place & label runs in `AllRunsClient`

**Files:**
- Modify: `components/AllRunsClient.tsx`
- Test: `__tests__/allRunsReskin.test.ts` (extend — this is the existing All Runs render test)

**Interfaces:**
- Consumes: `card.occurrenceDates`, `card.cadenceLabel` from Task 3.
- Produces: day-block placement gated on occurrence; a `data-testid="cadence-label"` element on non-weekly cards.

- [ ] **Step 1: Widen the client's `runs` prop type**

The page now passes objects with `occurrenceDates`/`cadenceLabel`, and `directoryRunToCard` requires them — so the prop can no longer be typed `DirectoryRun`. Point it at the enriched input type instead. In `components/AllRunsClient.tsx`:

```ts
// was: import type { DirectoryRun } from '@/lib/db'
import type { DirectoryCard, ViewerContext, DirectoryRunInput } from '@/lib/allRuns'
```

Change the `Props` field:

```ts
  // was: runs: DirectoryRun[]
  runs: DirectoryRunInput[]
```

`DirectoryRunInput` now carries every field the client reads (incl. `occurrenceDates`/`cadenceLabel` and the edit-drawer fields `day_of_week`/`meeting_time`/`meeting_location`/`distance`/`kind`), so no other client code changes here. Drop the now-unused `DirectoryRun` import to keep lint clean. The page's enriched objects (a `DirectoryRun` plus the two fields) structurally satisfy `DirectoryRunInput`.

- [ ] **Step 2: Write a failing render test**

Extend `__tests__/allRunsReskin.test.ts` (match its existing render-harness style — it already mounts `AllRunsClient` with fixture runs and a fixed `serverDate`). Add a fixture where the window's Friday is NOT the monthly run's occurrence, plus one where it is:

```ts
// Weekly run: present on its day. Monthly run: occurrenceDates set to a date
// OUTSIDE the rendered window should NOT place a card; a cadence label shows when present.
it('hides a monthly run on a week it does not occur, shows it with a label on a week it does', () => {
  // serverDate 2026-10-19 (Mon) → window includes Fri 2026-10-23 (the 4th Friday).
  // Donut run occurs 2026-10-09 only → not in window → no card.
  const runsOffWeek = [donutRun({ occurrenceDates: ['2026-10-09'], cadenceLabel: 'every month on the 2nd Friday' })]
  const { queryByText } = renderAllRuns(runsOffWeek, { serverDate: '2026-10-19' })
  expect(queryByText('Second Friday Donut Run')).toBeNull()

  // On its week (occurrenceDates include the window's Friday), it renders WITH the label.
  const runsOnWeek = [donutRun({ occurrenceDates: ['2026-10-23'], cadenceLabel: 'every month on the 2nd Friday' })]
  const { getByText, getByTestId } = renderAllRuns(runsOnWeek, { serverDate: '2026-10-19' })
  expect(getByText('Second Friday Donut Run')).toBeTruthy()
  expect(getByTestId('cadence-label').textContent).toContain('2nd')
})

it('a weekly run (empty label) shows no cadence label', () => {
  const runs = [weeklyTuesdayRun({ occurrenceDates: ['2026-10-20'], cadenceLabel: null })]
  const { queryByTestId } = renderAllRuns(runs, { serverDate: '2026-10-19' })
  expect(queryByTestId('cadence-label')).toBeNull()
})
```

(Use/extend the file's existing fixture factory; if none exists, add `donutRun`/`weeklyTuesdayRun` helpers that return a `DirectoryRun` with the new fields.)

- [ ] **Step 3: Run tests, verify they fail**

Run: `npx vitest run __tests__/allRunsReskin.test.ts`
Expected: FAIL — monthly run still placed by `card.day`; no `cadence-label` element.

- [ ] **Step 4: Gate day-block placement on occurrence**

In `components/AllRunsClient.tsx`, the day-block filter currently keys on `card.day === day`. Replace that clause with occurrence membership against the block's actual `date`. Add a local YMD helper mirroring the server's UTC formatting so the strings compare equal:

```ts
function toYmdLocal(date: Date): string {
  // AllRunsClient builds dates from `today = new Date(serverDate+'T00:00:00')`
  // and offsetDate; format by local components to match directoryWindowYmds' YMDs.
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
```

Then in the `dayCards` filter (currently `card.day === day`):

```ts
          const dayCards = cards
            .filter(card => {
              const a = cardAffordance(card, viewerCtx)
              return a.visible && card.occurrenceDates.includes(toYmdLocal(date)) && matchesFilter(card)
            })
            .sort((a, b) => a.startHour - b.startHour)
```

(`card.day` stays in use for the Following tier and the `wknd` branch of `matchesFilter`; only the day-block placement switches to occurrence membership. Weekly runs' `occurrenceDates` contain exactly their one day in the window, so their placement is unchanged.)

> Note the `serverDate+'T00:00:00'` local-midnight parse means `toYmdLocal` reads back the same calendar day the server emitted, for any server TZ at/behind UTC; the app runs in a single NYC timezone, consistent with the seam's UTC-internal / NYC-display split.

- [ ] **Step 5: Render the cadence label on non-weekly cards**

Inside `cardBody`, after the run-name row (near the `run-category-pill`), add the label when present:

```tsx
                        {card.cadenceLabel && (
                          <span
                            data-testid="cadence-label"
                            className="self-start text-[11px] font-semibold text-muted"
                          >
                            {card.cadenceLabel}
                          </span>
                        )}
```

- [ ] **Step 6: Run tests, verify they pass**

Run: `npx vitest run __tests__/allRunsReskin.test.ts`
Expected: PASS.

- [ ] **Step 7: Full suite + typecheck + lint**

Run: `npx vitest run`
Expected: PASS (no regressions in the other All Runs tests).
Run: `npx tsc --noEmit && npx eslint components/AllRunsClient.tsx lib/recurrence.ts lib/allRuns.ts`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add components/AllRunsClient.tsx __tests__/allRunsReskin.test.ts
git commit -m "feat(#448): place & label runs by real cadence in All Runs"
```

---

## Verification (whole-story, before PR)

- [ ] `npx vitest run` green; `npx tsc --noEmit` clean.
- [ ] Query the **test-data** and **Preview** branches: the five food-run rows carry their `rrule`/`rrule_dtstart`; every other run has `rrule IS NULL`.
- [ ] On the Preview URL, open All Runs on a week whose Friday is not the 2nd/3rd/4th → the corresponding food run is absent; on its week it appears under Friday with a cadence label. Weekly runs look exactly as before (no label, same placement).
- [ ] Grep for accidental client import of `rrule`: `rg -n "from 'rrule'" components/ app/**/*client*` → only server modules (`lib/recurrence.ts`, `app/all-runs/page.tsx`) reference it.

## PR notes

- **Test plan (Claude):** the four task commits' tests, `tsc`, lint, the `rg` client-bundle check, the test-data/Preview verify queries.
- **Manual steps (Lou):** apply `migrate-502.sql` to **production** and **demo-data** at/after merge (plain `run-migrate`, host-guarded; no `refresh-demo.ts` needed); eyeball the demo once applied. The PR carries #448's full AC.
- This PR touches >1 file → end the "PR is ready" message with the `gh pr merge` command and the "run `/review` before merging" line.
