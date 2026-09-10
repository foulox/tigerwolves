# Story 310 — Leader Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the multi-run data model into every leader surface — Plan, Library, Schedule, and a new Run Settings UI — so a partner run's leader can sign in, plan their workout, and generate a correct Heylo post.

**Architecture:** Each page server component calls `getLeaderRun(userId)` to identify the signed-in leader's run, then passes the run config down to client components. `buildPost` is fully parameterized from the run config (no hardcoded TigerWolves strings). A new `/run-config` route provides the Run Settings UI (post template + roster with rotation and away periods). Auto-generation of schedule entries runs idempotently on every Schedule/Plan page load.

**Tech Stack:** Next.js App Router, Neon serverless postgres (`@neondatabase/serverless`), Clerk (`@clerk/nextjs`), Tailwind CSS, Vitest (unit), Playwright (e2e)

**Spec:** `docs/superpowers/specs/2026-09-08-story-310-leader-experience-design.md`
**UI mockup (open before implementing any UI):** `scratch/run-config-final.html`

## Global Constraints

- `touch-manipulation` on every interactive element (mobile Safari tap fix)
- `aria-label` on every icon-only button
- Server Actions must use `updateTag('tigerwolves-data')` for cache invalidation (not `revalidateTag`) — see CLAUDE.md guardrail
- Every new Server Action call site needs its own `try/catch` + `Sentry.captureException`
- TypeScript clean: `npx tsc --noEmit` zero errors before opening PR
- `isLeader` check is `user?.publicMetadata?.role === 'leader'` — never `!!userId`
- DB migrations (Task 1 SQL) are a **Lou step** — agent writes the file, does not execute it
- Auto Mode blocks direct DB credential access — never attempt to run SQL directly
- Run tests with: `npm run test:unit` (unit) and `npm run test:e2e` (e2e)
- Branch off `main` after `git fetch origin main`

---

## File Map

**New files:**
- `scripts/migrate-310.sql` — schema additions for this story
- `app/run-config/page.tsx` — Run Settings server component (auth-gated)
- `app/run-config/actions.ts` — server actions: post template save, roster CRUD, away period save
- `components/RunConfigClient.tsx` — two-tab shell (Post template | Roster)
- `components/PostTemplateTab.tsx` — post template form
- `components/RosterTab.tsx` — rotation list, away panel, add/remove leader
- `components/LeaderPicker.tsx` — inline leader picker (used by PlanClient)
- `lib/rotation.ts` — pure rotation logic (no DB imports — testable in isolation)
- `__tests__/rotation.test.ts` — unit tests for rotation logic
- `e2e/run-config.spec.ts` — E2E tests for Run Settings

**Modified files:**
- `lib/data.ts` — add `RunConfig`, `RunLeader` types; remove `RUN_LEADERS`
- `lib/db.ts` — add `getLeaderRun`, `getRunRoster`, `generateScheduleHorizon`, `saveAwayPeriod`, `saveRotationOrder`, `saveLeaderForDate`, `addRunLeader`, `removeRunLeader`, `savePostTemplate`; update `fetchSchedule`, `fetchWorkoutVariants` with optional `runId`
- `lib/postBuilder.ts` — accept `RunConfig` and `roster: string[]` params; remove hardcoded strings
- `app/plan/page.tsx` — call `getLeaderRun`, pass run config + roster to PlanClient; call `generateScheduleHorizon`
- `app/page.tsx` (Schedule) — filter by `runId`; call `generateScheduleHorizon`
- `app/library/page.tsx` — pass `runId` to `fetchWorkoutVariants`; pass `runId` to LibraryClient
- `components/PlanClient.tsx` — accept `runConfig`, `roster`, `runLeaders` props; leader picker; verification checkbox
- `components/LibraryClient.tsx` — per-run filter default + "Your run | All runs" toggle
- `components/Header.tsx` — "Run Settings" entry in hamburger, conditional on `isLeader`
- `__tests__/postBuilder.test.ts` — add TigerWolves regression snapshot test

---

### Task 1: DB migrations

**Files:**
- Create: `scripts/migrate-310.sql`

**Note:** Lou runs this file manually against the Preview Neon branch and production via the Neon REST API. Do not attempt to execute it.

- [ ] **Step 1: Write migration file**

```sql
-- Story #310: leader experience additions
-- Run against Preview branch first, then production after PR merges.
-- All statements are IF NOT EXISTS / safe to replay.

-- 1. Add leader_intro to runs
ALTER TABLE runs ADD COLUMN IF NOT EXISTS leader_intro TEXT;

-- Backfill TigerWolves — must match current RUN_LEADERS join string exactly
UPDATE runs SET leader_intro = 'Run Leaders:' WHERE id = 'tigerwolves';

-- 2. Add away_periods to run_leaders
-- Note: run_leaders already has sort_order (used as rotation_order in this story)
ALTER TABLE run_leaders
  ADD COLUMN IF NOT EXISTS away_periods JSONB NOT NULL DEFAULT '[]';

-- 3. Add email to run_leaders (needed for Add Leader by email UI)
ALTER TABLE run_leaders ADD COLUMN IF NOT EXISTS email TEXT;

-- 4. Add needs_leader flag to schedule
ALTER TABLE schedule ADD COLUMN IF NOT EXISTS needs_leader BOOLEAN;

-- 5. Backfill rotation for TigerWolves (sort_order already set in #309 seed if done)
-- Only run if sort_order values are NULL:
-- UPDATE run_leaders SET sort_order = 1 WHERE run_id = 'tigerwolves' AND name = 'Luis';
-- UPDATE run_leaders SET sort_order = 2 WHERE run_id = 'tigerwolves' AND name = 'Lou';
-- UPDATE run_leaders SET sort_order = 3 WHERE run_id = 'tigerwolves' AND name = 'Kostas';
-- UPDATE run_leaders SET sort_order = 4 WHERE run_id = 'tigerwolves' AND name = 'Joelle';
-- UPDATE run_leaders SET sort_order = 5 WHERE run_id = 'tigerwolves' AND name = 'Kelsey';
-- UPDATE run_leaders SET sort_order = 6 WHERE run_id = 'tigerwolves' AND name = 'Obi';
-- UPDATE run_leaders SET sort_order = 7 WHERE run_id = 'tigerwolves' AND name = 'Jared';
```

- [ ] **Step 2: Commit**

```bash
git add scripts/migrate-310.sql
git commit -m "feat: migration SQL for story 310 leader experience"
```

---

### Task 2: Types and DB read queries

**Files:**
- Modify: `lib/data.ts`
- Modify: `lib/db.ts`
- Modify: `__tests__/db.test.ts`

**Interfaces:**
- Produces: `RunConfig`, `RunLeader` types used by every subsequent task
- Produces: `getLeaderRun(userId)`, `getRunRoster(runId)`, updated `fetchSchedule(runId?)`, updated `fetchWorkoutVariants(runId?)`

- [ ] **Step 1: Add types to `lib/data.ts`**

Remove the `RUN_LEADERS` export and add:

```typescript
// Remove this line:
// export const RUN_LEADERS = ['Luis', 'Lou', 'Kostas', 'Joelle', 'Kelsey', 'Obi', 'Jared']

export type RunConfig = {
  id: string
  name: string
  emoji: string | null
  dayOfWeek: string
  meetingLocation: string
  postHeader: string
  leaderIntro: string
  closingNotes: string
}

export type AwayPeriod = { from: string; to: string }

export type RunLeader = {
  id: number
  runId: string
  clerkUserId: string | null
  name: string
  email: string | null
  sortOrder: number | null
  awayPeriods: AwayPeriod[]
}
```

- [ ] **Step 2: Write failing tests for new DB functions**

In `__tests__/db.test.ts`, add:

```typescript
// These tests require the migration to have been applied to the test DB.
// They will fail until Task 1 SQL has been run against the staging branch.
describe('getLeaderRun', () => {
  test('returns TigerWolves config for a TigerWolves leader clerk_user_id', async () => {
    // Use the test leader's clerk_user_id from .env.test
    const run = await getLeaderRun(process.env.PLAYWRIGHT_TEST_CLERK_USER_ID!)
    expect(run).not.toBeNull()
    expect(run?.id).toBe('tigerwolves')
    expect(run?.leaderIntro).toBe('Run Leaders:')
  })

  test('returns null for unknown userId', async () => {
    const run = await getLeaderRun('user_nonexistent')
    expect(run).toBeNull()
  })
})

describe('getRunRoster', () => {
  test('returns leaders ordered by sort_order', async () => {
    const roster = await getRunRoster('tigerwolves')
    expect(roster.length).toBeGreaterThan(0)
    expect(roster[0].sortOrder).toBeLessThan(roster[1].sortOrder!)
  })
})
```

Run: `npm run test:unit -- db`
Expected: FAIL (functions not defined yet)

- [ ] **Step 3: Add `getLeaderRun` and `getRunRoster` to `lib/db.ts`**

```typescript
import type { RunConfig, RunLeader, AwayPeriod } from './data'

export async function getLeaderRun(clerkUserId: string): Promise<RunConfig | null> {
  const rows = await sql`
    SELECT r.id, r.name, r.emoji, r.day_of_week, r.meeting_location,
           r.post_header, r.leader_intro, r.closing_notes
    FROM run_leaders rl
    JOIN runs r ON r.id = rl.run_id
    WHERE rl.clerk_user_id = ${clerkUserId}
    LIMIT 1
  `
  if (!rows[0]) return null
  const r = rows[0]
  return {
    id: r.id as string,
    name: r.name as string,
    emoji: (r.emoji as string | null) ?? null,
    dayOfWeek: r.day_of_week as string,
    meetingLocation: r.meeting_location as string,
    postHeader: r.post_header as string,
    leaderIntro: (r.leader_intro as string | null) ?? 'Run Leaders:',
    closingNotes: r.closing_notes as string,
  }
}

export async function getRunRoster(runId: string): Promise<RunLeader[]> {
  const rows = await sql`
    SELECT id, run_id, clerk_user_id, name, email, sort_order, away_periods
    FROM run_leaders
    WHERE run_id = ${runId} AND active = true
    ORDER BY sort_order ASC NULLS LAST, id ASC
  `
  return rows.map(r => ({
    id: r.id as number,
    runId: r.run_id as string,
    clerkUserId: (r.clerk_user_id as string | null) ?? null,
    name: r.name as string,
    email: (r.email as string | null) ?? null,
    sortOrder: (r.sort_order as number | null) ?? null,
    awayPeriods: (r.away_periods as AwayPeriod[]) ?? [],
  }))
}
```

- [ ] **Step 4: Update `fetchSchedule` to accept optional `runId`**

```typescript
export async function fetchSchedule(runId?: string): Promise<ScheduleEntry[]> {
  const rows = runId
    ? await sql`SELECT * FROM schedule WHERE run_id = ${runId} ORDER BY date ASC`
    : await sql`SELECT * FROM schedule ORDER BY date ASC`
  // ... rest of mapping unchanged
}
```

- [ ] **Step 5: Update `fetchWorkoutVariants` to accept optional `runId`**

In the WHERE clause, change:
```typescript
// From:
WHERE wf.run_group_id IS NULL OR rg.name = 'TigerWolves'
// To: (add runId param — map run slug to run_group name for the query)
WHERE wf.run_group_id IS NULL OR rg.run_id = ${runId ?? 'tigerwolves'}
```

Note: verify how `run_groups` links to `runs` — there may be a `run_id` FK or a name match. Adjust accordingly.

- [ ] **Step 6: Run tests — expect pass**

```bash
npm run test:unit -- db
```

- [ ] **Step 7: Commit**

```bash
git add lib/data.ts lib/db.ts __tests__/db.test.ts
git commit -m "feat: RunConfig/RunLeader types, getLeaderRun, getRunRoster, per-run fetch params"
```

---

### Task 3: Rotation logic and schedule auto-generation

**Files:**
- Create: `lib/rotation.ts`
- Create: `__tests__/rotation.test.ts`
- Modify: `lib/db.ts` — add `generateScheduleHorizon`

**Interfaces:**
- Produces: `getNextLeader(roster, afterName, forDate)` — pure function, no DB
- Produces: `generateScheduleHorizon(runId, dayOfWeek, roster)` — DB write, idempotent

- [ ] **Step 1: Write failing unit tests**

Create `__tests__/rotation.test.ts`:

```typescript
import { describe, test, expect } from 'vitest'
import { getNextLeader, isLeaderAway } from '../lib/rotation'
import type { RunLeader } from '../lib/data'

const makeLeader = (name: string, sortOrder: number, awayPeriods: { from: string; to: string }[] = []): RunLeader => ({
  id: sortOrder,
  runId: 'test',
  clerkUserId: null,
  name,
  email: null,
  sortOrder,
  awayPeriods,
})

const roster = [
  makeLeader('Luis', 1),
  makeLeader('Lou', 2),
  makeLeader('Kelsey', 3),
  makeLeader('Obi', 4),
]

describe('isLeaderAway', () => {
  test('returns true when date falls within an away period', () => {
    const leader = makeLeader('Lou', 2, [{ from: '2025-12-23', to: '2026-01-04' }])
    expect(isLeaderAway(leader, '2025-12-30')).toBe(true)
  })

  test('returns false when date is outside all away periods', () => {
    const leader = makeLeader('Lou', 2, [{ from: '2025-12-23', to: '2026-01-04' }])
    expect(isLeaderAway(leader, '2025-12-22')).toBe(false)
    expect(isLeaderAway(leader, '2026-01-05')).toBe(false)
  })

  test('returns false when no away periods', () => {
    expect(isLeaderAway(roster[0], '2025-12-30')).toBe(false)
  })
})

describe('getNextLeader', () => {
  test('returns next in rotation after given name', () => {
    expect(getNextLeader(roster, 'Luis', '2025-11-01')).toBe('Lou')
    expect(getNextLeader(roster, 'Lou', '2025-11-01')).toBe('Kelsey')
  })

  test('wraps around after last leader', () => {
    expect(getNextLeader(roster, 'Obi', '2025-11-01')).toBe('Luis')
  })

  test('skips a leader who is away on the target date', () => {
    const rosterWithAway = [
      makeLeader('Luis', 1),
      makeLeader('Lou', 2, [{ from: '2025-12-23', to: '2026-01-04' }]),
      makeLeader('Kelsey', 3),
    ]
    expect(getNextLeader(rosterWithAway, 'Luis', '2025-12-30')).toBe('Kelsey')
  })

  test('returns null when all leaders are away', () => {
    const allAway = [
      makeLeader('Luis', 1, [{ from: '2025-12-23', to: '2026-01-04' }]),
      makeLeader('Lou', 2, [{ from: '2025-12-23', to: '2026-01-04' }]),
    ]
    expect(getNextLeader(allAway, 'Luis', '2025-12-30')).toBeNull()
  })
})
```

Run: `npm run test:unit -- rotation`
Expected: FAIL (module not found)

- [ ] **Step 2: Implement `lib/rotation.ts`**

```typescript
import type { RunLeader } from './data'

export function isLeaderAway(leader: RunLeader, date: string): boolean {
  return leader.awayPeriods.some(p => p.from <= date && date <= p.to)
}

export function getNextLeader(
  roster: RunLeader[],
  afterName: string,
  forDate: string,
): string | null {
  const sorted = [...roster].sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999))
  const currentIdx = sorted.findIndex(l => l.name === afterName)
  const startIdx = currentIdx === -1 ? 0 : currentIdx

  for (let i = 1; i <= sorted.length; i++) {
    const candidate = sorted[(startIdx + i) % sorted.length]
    if (!isLeaderAway(candidate, forDate)) return candidate.name
  }
  return null // all away
}
```

Run: `npm run test:unit -- rotation`
Expected: PASS

- [ ] **Step 3: Add `generateScheduleHorizon` to `lib/db.ts`**

```typescript
import { getNextLeader } from './rotation'
import { addWeeks, format, nextDay } from 'date-fns'

const DAY_MAP: Record<string, 0|1|2|3|4|5|6> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
}

// Idempotent — safe to call on every page load.
// Creates weekly schedule entries for `runId` up to 12 weeks from today,
// using the run's day_of_week and rotation roster.
export async function generateScheduleHorizon(
  runId: string,
  dayOfWeek: string,
  roster: RunLeader[],
): Promise<void> {
  const horizon = format(addWeeks(new Date(), 12), 'yyyy-MM-dd')

  // Find last existing entry for this run
  const lastRows = await sql`
    SELECT date, leader FROM schedule
    WHERE run_id = ${runId}
    ORDER BY date DESC LIMIT 1
  `
  const lastEntry = lastRows[0] ?? null
  const lastLeader = (lastEntry?.leader as string | null) ?? null

  // Find the next date to generate from
  const targetDay = DAY_MAP[dayOfWeek] ?? 2 // default Tuesday
  let cursor = lastEntry
    ? new Date((lastEntry.date as string) + 'T00:00:00')
    : new Date()

  // Advance to the first occurrence of targetDay on or after cursor
  while (cursor.getDay() !== targetDay) cursor = addWeeks(cursor, 0), cursor.setDate(cursor.getDate() + 1)
  // Move one week forward if we're at/past the last entry
  if (lastEntry) cursor.setDate(cursor.getDate() + 7)

  let currentLeader = lastLeader

  while (format(cursor, 'yyyy-MM-dd') <= horizon) {
    const dateStr = format(cursor, 'yyyy-MM-dd')

    // Check if entry already exists (idempotency)
    const exists = await sql`SELECT 1 FROM schedule WHERE date = ${dateStr}::date AND run_id = ${runId}`
    if (!exists[0]) {
      const nextLeader = getNextLeader(roster, currentLeader ?? '', dateStr)
      await sql`
        INSERT INTO schedule (date, run_id, workout_type, leader, needs_leader)
        VALUES (${dateStr}::date, ${runId}, '', ${nextLeader ?? ''}, ${nextLeader === null})
        ON CONFLICT (date) DO NOTHING
      `
      currentLeader = nextLeader ?? currentLeader
    }

    cursor.setDate(cursor.getDate() + 7)
  }
}
```

- [ ] **Step 4: Run unit tests**

```bash
npm run test:unit
```

Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add lib/rotation.ts __tests__/rotation.test.ts lib/db.ts
git commit -m "feat: rotation logic, isLeaderAway, generateScheduleHorizon"
```

---

### Task 4: postBuilder parameterization + TigerWolves regression test

**Files:**
- Modify: `lib/postBuilder.ts`
- Modify: `__tests__/postBuilder.test.ts`

**Interfaces:**
- Consumes: `RunConfig` from `lib/data.ts`
- Produces: updated `buildPost(entry, selections, runConfig, roster, activeType?)` — same output for TigerWolves fixture

- [ ] **Step 1: Write the TigerWolves regression snapshot test FIRST (before touching buildPost)**

Add to `__tests__/postBuilder.test.ts`:

```typescript
import type { RunConfig } from '../lib/data'

const tigerWolvesConfig: RunConfig = {
  id: 'tigerwolves',
  name: 'TigerWolves',
  emoji: '🐯🐺',
  dayOfWeek: 'Tuesday',
  meetingLocation: [
    'Starting point and route: Tom Stofka Garden, aka "Da Bins."',
    "We'll warm up by jogging to Marsha P. Johnson which is at the corner of North 8th and Kent",
    'The run will be along the Kent Avenue Speedway',
    "We'll finish up back at Marsha P. Johnson State Park and cool down with a jog to the track",
  ].join('\n'),
  postHeader: '🐯🐺 TigerWolves Tuesday Workout',
  leaderIntro: 'Run Leaders:',
  closingNotes: 'Bag Drop: Sorry, Not available',
}

const tigerWolvesRoster = ['Luis', 'Lou', 'Kostas', 'Joelle', 'Kelsey', 'Obi', 'Jared']

test('TigerWolves output matches pre-parameterization snapshot', () => {
  // Run this test against the OLD buildPost first to create the snapshot,
  // then update buildPost signature — the snapshot must still match.
  // On first run: vitest creates __tests__/__snapshots__/postBuilder.test.ts.snap
  const post = buildPost(entry, [baseWorkout], tigerWolvesConfig, tigerWolvesRoster)
  expect(post).toMatchSnapshot()
})
```

**Important:** The new `buildPost` signature adds `runConfig` and `roster` params. You need to:
1. Temporarily call the OLD buildPost and capture its output as the expected string
2. Update the signature
3. Verify the new call produces identical output

The fastest way: run the existing tests first to confirm they pass, then update the signature.

- [ ] **Step 2: Run existing tests to confirm baseline**

```bash
npm run test:unit -- postBuilder
```

Expected: all current tests PASS

- [ ] **Step 3: Update `buildPost` signature and replace hardcoded strings**

```typescript
// lib/postBuilder.ts — updated signature
import type { ScheduleEntry, WorkoutVariantRow, RunConfig } from './data'
// Remove: import { RUN_LEADERS } from './data'

export function buildPost(
  entry: ScheduleEntry,
  selections: WorkoutVariantRow[],
  runConfig: RunConfig,
  roster: string[],
  activeType: string | null = null,
): string {
  const sorted = [...selections].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  const primary = sorted[0]

  const lines = [
    runConfig.postHeader,                    // was: '🐯🐺 TigerWolves Tuesday Workout'
    '',
    '👉 https://tigerwolves.foulox.me 👈',  // app-wide, stays hardcoded
    '👀 See every workout between now and the NYC Marathon in the app',
    '🗳️ React to let us know what you like — and what you don\'t',
    '',
    `📅 ${formatDateLong(entry.date)}`,
    `🏃🏻‍♂️‍➡️ ${activeType ?? entry.workoutType}: ${primary.name}`,
  ]

  if (primary.reason) lines.push('', primary.reason)

  // meetingLocation replaces the hardcoded Tom Stofka / warmup / route block
  lines.push('', ...runConfig.meetingLocation.split('\n').map((l, i) => i === 0 ? `📍 ${l}` : l), '')

  // workout body (unchanged)
  if (sorted.length === 2) {
    const [standard, longer] = sorted
    const stdContent = formatMainContent(standard.rawInput)
    const lngContent = formatMainContent(longer.rawInput)
    const stdTa = turnaroundLine(standard)
    const lngTa = turnaroundLine(longer)
    lines.push(
      '🏁🏃🏻‍♂️‍➡️ WORKOUT 🏃🏻‍♂️‍➡️🏁', '',
      'Standard', stdContent, ...(stdTa ? [stdTa] : []), '',
      'Longer', lngContent, ...(lngTa ? [lngTa] : []),
    )
  } else {
    const w = sorted[0]
    const ta = turnaroundLine(w)
    lines.push(formatMainSection(w.rawInput))
    if (ta) lines.push('', ta)
  }

  lines.push(
    '',
    runConfig.closingNotes,                        // was: 'Bag Drop: Sorry, Not available'
    '',
    `Led by ${entry.leader} — see you out there! 🔥`,
    `${runConfig.leaderIntro} ${roster.join(', ')}`, // was: `Run Leaders: ${RUN_LEADERS.join(', ')}`
  )

  return lines.join('\n')
}
```

- [ ] **Step 4: Update all `buildPost` call sites**

Search for all `buildPost(` calls: `rg 'buildPost\(' --glob '*.ts' --glob '*.tsx'`

Each call site needs `runConfig` and `roster` added. In `components/PlanClient.tsx`:

```typescript
// Before (existing):
const post = entry && effectiveSelections.length > 0 ? buildPost(entry, effectiveSelections, activeType) : ''

// After (Task 5 will pass these props in — for now use placeholders that match TigerWolves):
const post = entry && effectiveSelections.length > 0
  ? buildPost(entry, effectiveSelections, runConfig, roster, activeType)
  : ''
```

PlanClient will receive `runConfig` and `roster` as props (wired in Task 5). For now, add them to the Props type as optional with TigerWolves defaults so the app compiles:

```typescript
// Temporary — Task 5 makes these required
type Props = {
  // ... existing props
  runConfig?: RunConfig
  roster?: string[]
}
```

- [ ] **Step 5: Run tests — snapshot will be created on first run, must match thereafter**

```bash
npm run test:unit -- postBuilder
```

Expected: snapshot created, all tests pass

- [ ] **Step 6: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: zero errors

- [ ] **Step 7: Commit**

```bash
git add lib/postBuilder.ts lib/data.ts __tests__/postBuilder.test.ts
git commit -m "feat: parameterize buildPost with RunConfig and roster; regression snapshot"
```

---

### Task 5: Per-run wiring — Plan, Library, Schedule pages

**Files:**
- Modify: `app/plan/page.tsx`
- Modify: `app/page.tsx`
- Modify: `app/library/page.tsx`
- Modify: `components/PlanClient.tsx` (props only — full changes in Task 9)
- Modify: `components/LibraryClient.tsx`

**Interfaces:**
- Consumes: `getLeaderRun`, `getRunRoster`, `generateScheduleHorizon`, `fetchSchedule(runId)`, `fetchWorkoutVariants(runId)` from Task 2/3
- Produces: all three pages pass `runConfig` and `roster` downstream

- [ ] **Step 1: Update `app/plan/page.tsx`**

```typescript
export default async function PlanPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const user = await currentUser()
  const isLeader = user?.publicMetadata?.role === 'leader'

  // Identify this leader's run (falls back to TigerWolves config if not found)
  const tigerWolvesConfig: RunConfig = {
    id: 'tigerwolves', name: 'TigerWolves', emoji: '🐯🐺', dayOfWeek: 'Tuesday',
    postHeader: '🐯🐺 TigerWolves Tuesday Workout',
    meetingLocation: 'Starting point and route: Tom Stofka Garden, aka "Da Bins."\nWe\'ll warm up by jogging to Marsha P. Johnson which is at the corner of North 8th and Kent\nThe run will be along the Kent Avenue Speedway\nWe\'ll finish up back at Marsha P. Johnson State Park and cool down with a jog to the track',
    leaderIntro: 'Run Leaders:',
    closingNotes: 'Bag Drop: Sorry, Not available',
  }
  const runConfig = (user && isLeader ? await getLeaderRun(user.id) : null) ?? tigerWolvesConfig
  const runLeaders = await getRunRoster(runConfig.id)
  const roster = runLeaders
    .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999))
    .map(l => l.name)

  // Auto-generate schedule horizon (idempotent, runs outside cache)
  if (isLeader) {
    await generateScheduleHorizon(runConfig.id, runConfig.dayOfWeek, runLeaders)
  }

  const { schedule, workoutVariants } = await fetchData()  // TODO in future: pass runId
  // ...rest of existing page logic

  return <PlanClient
    upcoming={upcoming}
    variants={workoutVariants}
    initialWeekIndex={initialWeekIndex}
    isLeader={isLeader}
    voteData={voteData}
    runConfig={runConfig}
    roster={roster}
    runLeaders={runLeaders}
  />
}
```

- [ ] **Step 2: Update `app/page.tsx` (Schedule)**

Same pattern: call `getLeaderRun`, `getRunRoster`, `generateScheduleHorizon`. Pass `runId` to `fetchSchedule`.

```typescript
const runConfig = (user && isLeader ? await getLeaderRun(user.id) : null) ?? tigerWolvesConfig
const runLeaders = isLeader ? await getRunRoster(runConfig.id) : []
if (isLeader) await generateScheduleHorizon(runConfig.id, runConfig.dayOfWeek, runLeaders)
const schedule = await fetchSchedule(runConfig.id)
// pass runConfig.dayOfWeek to ScheduleClient for subtitle: "Upcoming {dayOfWeek}s"
```

- [ ] **Step 3: Update `app/library/page.tsx`**

```typescript
const runConfig = (user && isLeader ? await getLeaderRun(user.id) : null) ?? tigerWolvesConfig
const workoutVariants = await fetchWorkoutVariants(isLeader ? runConfig.id : undefined)
// pass runId to LibraryClient
return <LibraryClient variants={workoutVariants} isLeader={isLeader} voteData={voteData} runId={runConfig.id} />
```

- [ ] **Step 4: Add "Your run | All runs" toggle to `LibraryClient`**

Add `runId?: string` prop. Add toggle state `const [showAllRuns, setShowAllRuns] = useState(false)`. When `showAllRuns` is false, pre-filter `variants` to those matching `runId`. Add toggle UI above the search bar:

```tsx
{runId && (
  <div className="flex gap-2 px-4 pb-2">
    <button
      onClick={() => setShowAllRuns(false)}
      className={`text-xs font-semibold px-3 py-1.5 rounded-full touch-manipulation ${!showAllRuns ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
    >Your run</button>
    <button
      onClick={() => setShowAllRuns(true)}
      className={`text-xs font-semibold px-3 py-1.5 rounded-full touch-manipulation ${showAllRuns ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
    >All runs</button>
  </div>
)}
```

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add app/plan/page.tsx app/page.tsx app/library/page.tsx components/PlanClient.tsx components/LibraryClient.tsx
git commit -m "feat: per-run wiring for Plan, Schedule, Library pages"
```

---

### Task 6: Header — Run Settings navigation entry

**Files:**
- Modify: `components/Header.tsx`

- [ ] **Step 1: Find the hamburger menu in Header.tsx**

```bash
rg 'Roadmap\|hamburger\|HamburgerMenu\|MenuIcon\|menu' components/Header.tsx
```

- [ ] **Step 2: Add Run Settings entry**

Inside the hamburger menu list, add before Roadmap (or after Send feedback — wherever settings-type items live):

```tsx
{isLeader && (
  <Link
    href="/run-config"
    className="flex items-center gap-3 px-4 py-3 text-gray-700 active:bg-gray-50 touch-manipulation"
    aria-label="Run Settings"
  >
    <Settings size={20} className="text-gray-400" />
    <span className="font-medium">Run Settings</span>
  </Link>
)}
```

Import `Settings` from `lucide-react`.

- [ ] **Step 3: Verify it doesn't show for non-leaders**

The `isLeader` prop already flows into Header — confirm it's available in the hamburger menu render scope.

- [ ] **Step 4: Commit**

```bash
git add components/Header.tsx
git commit -m "feat: Run Settings entry in hamburger menu (leader only)"
```

---

### Task 7: Run config route + Post template tab

**Files:**
- Create: `app/run-config/page.tsx`
- Create: `app/run-config/actions.ts`
- Create: `components/RunConfigClient.tsx`
- Create: `components/PostTemplateTab.tsx`

**Reference:** Open `scratch/run-config-final.html` — "Post template tab" screen — before writing UI.

- [ ] **Step 1: Create the server action for saving post template**

`app/run-config/actions.ts`:

```typescript
'use server'
import { currentUser } from '@clerk/nextjs/server'
import { updateTag } from 'next/cache'
import * as Sentry from '@sentry/nextjs'
import { sql } from '@/lib/db'
import { getLeaderRun } from '@/lib/db'

export async function savePostTemplate(data: {
  postHeader: string
  meetingLocation: string
  leaderIntro: string
  closingNotes: string
}): Promise<{ error?: string }> {
  try {
    const user = await currentUser()
    if (!user || user.publicMetadata?.role !== 'leader') return { error: 'Unauthorized' }
    const run = await getLeaderRun(user.id)
    if (!run) return { error: 'Run not found' }

    await sql`
      UPDATE runs SET
        post_header = ${data.postHeader},
        meeting_location = ${data.meetingLocation},
        leader_intro = ${data.leaderIntro},
        closing_notes = ${data.closingNotes}
      WHERE id = ${run.id}
    `
    updateTag('tigerwolves-data')
    return {}
  } catch (err) {
    Sentry.captureException(err)
    return { error: 'Failed to save' }
  }
}
```

- [ ] **Step 2: Create `app/run-config/page.tsx`**

```typescript
import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getLeaderRun, getRunRoster } from '@/lib/db'
import RunConfigClient from '@/components/RunConfigClient'

export default async function RunConfigPage() {
  const user = await currentUser()
  if (!user) redirect('/sign-in')
  if (user.publicMetadata?.role !== 'leader') redirect('/')

  const runConfig = await getLeaderRun(user.id)
  if (!runConfig) redirect('/')

  const runLeaders = await getRunRoster(runConfig.id)
  return <RunConfigClient runConfig={runConfig} runLeaders={runLeaders} currentUserId={user.id} />
}
```

- [ ] **Step 3: Create `components/RunConfigClient.tsx`** — two-tab shell

```tsx
'use client'
import { useState } from 'react'
import PostTemplateTab from './PostTemplateTab'
import RosterTab from './RosterTab'
import Header from './Header'
import type { RunConfig, RunLeader } from '@/lib/data'

type Props = { runConfig: RunConfig; runLeaders: RunLeader[]; currentUserId: string }

export default function RunConfigClient({ runConfig, runLeaders, currentUserId }: Props) {
  const [tab, setTab] = useState<'template' | 'roster'>('template')
  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Run Settings" subtitle={runConfig.name} isLeader={true} showBack />
      <div className="flex border-b border-gray-200 bg-white">
        {(['template', 'roster'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-sm font-semibold touch-manipulation ${tab === t ? 'text-orange-600 border-b-2 border-orange-600' : 'text-gray-400'}`}
          >
            {t === 'template' ? 'Post template' : 'Roster'}
          </button>
        ))}
      </div>
      {tab === 'template' && <PostTemplateTab runConfig={runConfig} />}
      {tab === 'roster' && <RosterTab runLeaders={runLeaders} runId={runConfig.id} currentUserId={currentUserId} />}
    </div>
  )
}
```

- [ ] **Step 4: Create `components/PostTemplateTab.tsx`**

Four fields + Save button. Refer to `scratch/run-config-final.html` "Post template tab" screen for visual layout.

```tsx
'use client'
import { useState, useTransition } from 'react'
import * as Sentry from '@sentry/nextjs'
import { savePostTemplate } from '@/app/run-config/actions'
import type { RunConfig } from '@/lib/data'

export default function PostTemplateTab({ runConfig }: { runConfig: RunConfig }) {
  const [form, setForm] = useState({
    postHeader: runConfig.postHeader,
    meetingLocation: runConfig.meetingLocation,
    leaderIntro: runConfig.leaderIntro,
    closingNotes: runConfig.closingNotes,
  })
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      try {
        const result = await savePostTemplate(form)
        if (result.error) { setError(result.error); return }
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } catch (err) {
        Sentry.captureException(err)
        setError('Something went wrong')
      }
    })
  }

  const field = (label: string, key: keyof typeof form, multiline = false) => (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{label}</label>
      {multiline ? (
        <textarea
          value={form[key]}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 resize-none min-h-[60px] touch-manipulation"
        />
      ) : (
        <input
          type="text"
          value={form[key]}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 touch-manipulation"
        />
      )}
    </div>
  )

  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="bg-white rounded-xl p-4 flex flex-col gap-3 shadow-sm">
        {field('Post header', 'postHeader', true)}
        {field('Meeting location', 'meetingLocation', true)}
        {field('Leader intro', 'leaderIntro')}
        {field('Closing notes', 'closingNotes', true)}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          onClick={handleSave}
          disabled={isPending}
          className="bg-orange-600 text-white rounded-xl py-3 font-bold text-sm disabled:opacity-50 touch-manipulation"
        >
          {saved ? 'Saved!' : isPending ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add app/run-config/ components/RunConfigClient.tsx components/PostTemplateTab.tsx
git commit -m "feat: Run Settings route, post template tab, savePostTemplate action"
```

---

### Task 8: Roster tab — rotation, away periods, retroactive reassignment

**Files:**
- Create: `components/RosterTab.tsx`
- Modify: `app/run-config/actions.ts` — add roster actions

**Reference:** Open `scratch/run-config-final.html` — "Roster tab — default", "away period open", "away saved" screens.

- [ ] **Step 1: Add roster server actions to `app/run-config/actions.ts`**

```typescript
export async function saveRotationOrder(
  orderedIds: number[]  // run_leader ids in new order
): Promise<{ error?: string }> {
  try {
    const user = await currentUser()
    if (!user || user.publicMetadata?.role !== 'leader') return { error: 'Unauthorized' }
    for (let i = 0; i < orderedIds.length; i++) {
      await sql`UPDATE run_leaders SET sort_order = ${i + 1} WHERE id = ${orderedIds[i]}`
    }
    updateTag('tigerwolves-data')
    return {}
  } catch (err) {
    Sentry.captureException(err)
    return { error: 'Failed to save order' }
  }
}

export async function saveAwayPeriod(
  leaderId: number,
  period: { from: string; to: string }
): Promise<{ error?: string; reassignedCount: number; noLeaderDates: string[] }> {
  try {
    const user = await currentUser()
    if (!user || user.publicMetadata?.role !== 'leader') return { error: 'Unauthorized', reassignedCount: 0, noLeaderDates: [] }

    // Append period to away_periods
    await sql`
      UPDATE run_leaders
      SET away_periods = away_periods || ${JSON.stringify([period])}::jsonb
      WHERE id = ${leaderId}
    `

    // Find this leader's name and run_id
    const leaderRows = await sql`SELECT name, run_id FROM run_leaders WHERE id = ${leaderId}`
    const leaderName = leaderRows[0].name as string
    const runId = leaderRows[0].run_id as string

    // Get full roster for reassignment
    const roster = await getRunRoster(runId)

    // Find schedule entries in range assigned to this leader
    const affected = await sql`
      SELECT date FROM schedule
      WHERE run_id = ${runId}
        AND leader = ${leaderName}
        AND date >= ${period.from}::date
        AND date <= ${period.to}::date
      ORDER BY date ASC
    `

    let reassignedCount = 0
    const noLeaderDates: string[] = []

    for (const row of affected) {
      const dateStr = (row.date as Date).toISOString().slice(0, 10)
      // Find the previous leader (the one before this leader in rotation on this date)
      // Then advance from them to skip the away leader
      const beforeIdx = roster.findIndex(l => l.name === leaderName)
      const prevLeader = roster[(beforeIdx - 1 + roster.length) % roster.length]
      const next = getNextLeader(roster, prevLeader.name, dateStr)

      if (next === null) {
        await sql`UPDATE schedule SET needs_leader = true WHERE date = ${dateStr}::date AND run_id = ${runId}`
        noLeaderDates.push(dateStr)
      } else {
        await sql`UPDATE schedule SET leader = ${next}, needs_leader = null WHERE date = ${dateStr}::date AND run_id = ${runId}`
        reassignedCount++
      }
    }

    updateTag('tigerwolves-data')
    return { reassignedCount, noLeaderDates }
  } catch (err) {
    Sentry.captureException(err)
    return { error: 'Failed to save away period', reassignedCount: 0, noLeaderDates: [] }
  }
}

export async function removeAwayPeriod(
  leaderId: number,
  periodIndex: number
): Promise<{ error?: string }> {
  try {
    const user = await currentUser()
    if (!user || user.publicMetadata?.role !== 'leader') return { error: 'Unauthorized' }
    // Remove element at periodIndex from JSONB array
    await sql`
      UPDATE run_leaders
      SET away_periods = away_periods - ${periodIndex}
      WHERE id = ${leaderId}
    `
    updateTag('tigerwolves-data')
    return {}
  } catch (err) {
    Sentry.captureException(err)
    return { error: 'Failed to remove period' }
  }
}

export async function addRunLeaderByEmail(
  runId: string,
  email: string
): Promise<{ error?: string }> {
  try {
    const user = await currentUser()
    if (!user || user.publicMetadata?.role !== 'leader') return { error: 'Unauthorized' }
    // Look up Clerk user by email to get their name
    // Note: Clerk Admin API is needed here — use process.env.CLERK_SECRET_KEY
    // Simplest approach: insert with email, name defaults to email prefix until they sign in
    const name = email.split('@')[0]
    const maxOrder = await sql`SELECT MAX(sort_order) AS m FROM run_leaders WHERE run_id = ${runId}`
    const nextOrder = ((maxOrder[0].m as number | null) ?? 0) + 1
    await sql`
      INSERT INTO run_leaders (run_id, name, email, sort_order, active)
      VALUES (${runId}, ${name}, ${email}, ${nextOrder}, true)
      ON CONFLICT (run_id, name) DO UPDATE SET email = ${email}, active = true
    `
    updateTag('tigerwolves-data')
    return {}
  } catch (err) {
    Sentry.captureException(err)
    return { error: 'Failed to add leader' }
  }
}

export async function removeRunLeader(leaderId: number): Promise<{ error?: string }> {
  try {
    const user = await currentUser()
    if (!user || user.publicMetadata?.role !== 'leader') return { error: 'Unauthorized' }
    await sql`UPDATE run_leaders SET active = false WHERE id = ${leaderId}`
    updateTag('tigerwolves-data')
    return {}
  } catch (err) {
    Sentry.captureException(err)
    return { error: 'Failed to remove leader' }
  }
}
```

- [ ] **Step 2: Write unit test for retroactive reassignment logic**

Add to `__tests__/rotation.test.ts`:

```typescript
describe('getNextLeader reassignment', () => {
  test('skips away leader when finding replacement', () => {
    const rosterWithAway = [
      makeLeader('Luis', 1),
      makeLeader('Lou', 2, [{ from: '2025-12-23', to: '2026-01-04' }]),
      makeLeader('Kelsey', 3),
    ]
    // When Lou is away, the next after whoever preceded Lou is Kelsey
    const prevLeader = rosterWithAway[0] // Luis precedes Lou
    const result = getNextLeader(rosterWithAway, prevLeader.name, '2025-12-30')
    expect(result).toBe('Kelsey')
  })
})
```

Run: `npm run test:unit -- rotation`
Expected: PASS

- [ ] **Step 3: Create `components/RosterTab.tsx`**

This is a longer component. Refer to the three Roster tab screens in `scratch/run-config-final.html`. Key behavior:
- List leaders ordered by `sortOrder`
- Up/down arrows call `saveRotationOrder` with reordered IDs
- "Away" button toggles inline panel for that row
- Away panel shows existing periods + date inputs for new period
- Badge on row: next upcoming away period; if multiple, show "(+N more)"
- Confirmation banner appears after save with reassignment count
- Warning if `noLeaderDates.length > 0`: list specific dates needing manual assignment

```tsx
'use client'
import { useState, useTransition } from 'react'
import * as Sentry from '@sentry/nextjs'
import { saveRotationOrder, saveAwayPeriod, removeAwayPeriod, addRunLeaderByEmail, removeRunLeader } from '@/app/run-config/actions'
import type { RunLeader, AwayPeriod } from '@/lib/data'

function upcomingPeriods(periods: AwayPeriod[]): AwayPeriod[] {
  const today = new Date().toISOString().slice(0, 10)
  return periods.filter(p => p.to >= today).sort((a, b) => a.from.localeCompare(b.from))
}

function awayBadgeText(periods: AwayPeriod[]): string | null {
  const future = upcomingPeriods(periods)
  if (!future.length) return null
  const first = `Away ${future[0].from.slice(5)} – ${future[0].to.slice(5)}`
  return future.length > 1 ? `${first} (+${future.length - 1} more)` : first
}

export default function RosterTab({
  runLeaders, runId, currentUserId,
}: { runLeaders: RunLeader[]; runId: string; currentUserId: string }) {
  const [leaders, setLeaders] = useState(runLeaders)
  const [openAwayId, setOpenAwayId] = useState<number | null>(null)
  const [newFrom, setNewFrom] = useState('')
  const [newTo, setNewTo] = useState('')
  const [banner, setBanner] = useState<string | null>(null)
  const [newEmail, setNewEmail] = useState('')
  const [isPending, startTransition] = useTransition()

  function moveLeader(idx: number, direction: -1 | 1) {
    const next = [...leaders]
    const swap = idx + direction
    if (swap < 0 || swap >= next.length) return
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    setLeaders(next)
    startTransition(async () => {
      try {
        await saveRotationOrder(next.map(l => l.id))
      } catch (err) {
        Sentry.captureException(err)
      }
    })
  }

  function handleSaveAway(leaderId: number) {
    if (!newFrom || !newTo) return
    startTransition(async () => {
      try {
        const result = await saveAwayPeriod(leaderId, { from: newFrom, to: newTo })
        if (result.error) return
        const msgs = [`✓ Away period saved · ${result.reassignedCount} schedule entries reassigned`]
        if (result.noLeaderDates.length) msgs.push(`⚠ No available leader for: ${result.noLeaderDates.join(', ')} — assign manually`)
        setBanner(msgs.join('\n'))
        setTimeout(() => setBanner(null), 6000)
        setNewFrom(''); setNewTo('')
        setOpenAwayId(null)
        // Refresh leader list from server (simple: reload page — or update local state)
      } catch (err) {
        Sentry.captureException(err)
      }
    })
  }

  function handleAddLeader() {
    if (!newEmail.trim()) return
    startTransition(async () => {
      try {
        await addRunLeaderByEmail(runId, newEmail.trim())
        setNewEmail('')
      } catch (err) {
        Sentry.captureException(err)
      }
    })
  }

  return (
    <div className="p-4 flex flex-col gap-4">
      {banner && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm font-semibold text-green-800 whitespace-pre-line">{banner}</div>
      )}

      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Rotation order</p>
        <div className="bg-white rounded-xl overflow-hidden shadow-sm divide-y divide-gray-100">
          {leaders.map((l, idx) => {
            const badge = awayBadgeText(l.awayPeriods)
            const isOpen = openAwayId === l.id
            const future = upcomingPeriods(l.awayPeriods)
            return (
              <div key={l.id}>
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <span className="text-xs font-bold text-gray-300 w-4 text-center">{idx + 1}</span>
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => moveLeader(idx, -1)}
                      disabled={idx === 0}
                      className="text-gray-300 text-xs leading-none disabled:opacity-20 touch-manipulation"
                      aria-label="Move up"
                    >▲</button>
                    <button
                      onClick={() => moveLeader(idx, 1)}
                      disabled={idx === leaders.length - 1}
                      className="text-gray-300 text-xs leading-none disabled:opacity-20 touch-manipulation"
                      aria-label="Move down"
                    >▼</button>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-500 shrink-0">
                    {l.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900 flex items-center gap-1 flex-wrap">
                      {l.name}
                      {l.clerkUserId === currentUserId && <span className="text-[9px] bg-green-50 text-green-600 font-bold px-1.5 py-0.5 rounded">you</span>}
                      {badge && <span className="text-[9px] bg-yellow-50 text-yellow-700 font-bold px-1.5 py-0.5 rounded">{badge}</span>}
                    </div>
                    {l.email && <div className="text-xs text-gray-400">{l.email}</div>}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      onClick={() => { setOpenAwayId(isOpen ? null : l.id); setNewFrom(''); setNewTo('') }}
                      className={`text-[10px] font-bold border rounded-md px-2 py-1 touch-manipulation ${isOpen ? 'border-yellow-300 text-yellow-700 bg-yellow-50' : 'border-gray-200 text-gray-500 bg-white'}`}
                    >Away{isOpen ? ' ▾' : ''}</button>
                    <button
                      onClick={() => { startTransition(async () => { try { await removeRunLeader(l.id); setLeaders(prev => prev.filter(r => r.id !== l.id)) } catch(e) { Sentry.captureException(e) } }) }}
                      className="w-6 h-6 rounded-full bg-red-50 text-orange-600 flex items-center justify-center text-sm touch-manipulation"
                      aria-label={`Remove ${l.name}`}
                    >×</button>
                  </div>
                </div>
                {isOpen && (
                  <div className="bg-yellow-50 border-t border-yellow-100 px-3 py-3 flex flex-col gap-2">
                    {future.map((p, pi) => (
                      <div key={pi} className="flex justify-between items-center bg-white rounded-lg px-3 py-2 border border-yellow-200 text-xs">
                        <span className="font-semibold text-yellow-800">{p.from} – {p.to}</span>
                        <button
                          onClick={() => startTransition(async () => { try { await removeAwayPeriod(l.id, l.awayPeriods.indexOf(p)); setLeaders(prev => prev.map(r => r.id === l.id ? { ...r, awayPeriods: r.awayPeriods.filter((_, i) => i !== r.awayPeriods.indexOf(p)) } : r)) } catch(e) { Sentry.captureException(e) } })}
                          className="text-yellow-700 font-bold touch-manipulation"
                        >Remove</button>
                      </div>
                    ))}
                    <div className="flex gap-2 items-center">
                      <label className="text-[10px] font-bold text-yellow-800 w-8">From</label>
                      <input type="date" value={newFrom} onChange={e => setNewFrom(e.target.value)} className="flex-1 bg-white border border-yellow-200 rounded-lg px-2 py-1.5 text-xs touch-manipulation" />
                    </div>
                    <div className="flex gap-2 items-center">
                      <label className="text-[10px] font-bold text-yellow-800 w-8">To</label>
                      <input type="date" value={newTo} onChange={e => setNewTo(e.target.value)} className="flex-1 bg-white border border-yellow-200 rounded-lg px-2 py-1.5 text-xs touch-manipulation" />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setOpenAwayId(null)} className="bg-white border border-yellow-200 text-yellow-800 rounded-lg px-3 py-1.5 text-xs font-bold touch-manipulation">Cancel</button>
                      <button onClick={() => handleSaveAway(l.id)} disabled={isPending || !newFrom || !newTo} className="bg-yellow-600 text-white rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50 touch-manipulation">Save away period</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Add leader</p>
        <div className="flex gap-2">
          <input
            type="email"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            placeholder="Email address…"
            className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm touch-manipulation"
          />
          <button
            onClick={handleAddLeader}
            disabled={isPending || !newEmail.trim()}
            className="bg-orange-600 text-white rounded-lg px-3 py-2 text-sm font-bold disabled:opacity-50 touch-manipulation"
          >Add</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add components/RosterTab.tsx app/run-config/actions.ts
git commit -m "feat: Roster tab — rotation, away periods, retroactive reassignment"
```

---

### Task 9: LeaderPicker component + Plan page leader change

**Files:**
- Create: `components/LeaderPicker.tsx`
- Modify: `components/PlanClient.tsx`
- Modify: `app/run-config/actions.ts` — add `saveScheduleLeader`
- Modify: `app/actions.ts` — add `saveScheduleLeader` (or in run-config/actions)

**Reference:** Open `scratch/run-config-final.html` — "Plan page — tappable leader field" and "Plan page — leader picker open" screens.

- [ ] **Step 1: Add `saveScheduleLeader` action**

In `app/actions.ts`:

```typescript
export async function saveScheduleLeader(date: string, leader: string): Promise<void> {
  try {
    const user = await currentUser()
    if (!user || user.publicMetadata?.role !== 'leader') throw new Error('Unauthorized')
    await sql`UPDATE schedule SET leader = ${leader}, needs_leader = null WHERE date = ${date}::date`
    updateTag('tigerwolves-data')
    await captureServerEvent('schedule_leader_changed', user.id, { date, leader })
  } catch (err) {
    Sentry.captureException(err)
    throw err
  }
}
```

- [ ] **Step 2: Create `components/LeaderPicker.tsx`**

```tsx
'use client'
import { useState, useTransition } from 'react'
import * as Sentry from '@sentry/nextjs'
import { saveScheduleLeader } from '@/app/actions'
import type { RunLeader } from '@/lib/data'

type Props = {
  date: string
  currentLeader: string
  runLeaders: RunLeader[]
  onClose: () => void
  onSaved: (leader: string) => void
}

function isCurrentlyAway(leader: RunLeader, date: string): boolean {
  return leader.awayPeriods.some(p => p.from <= date && date <= p.to)
}

export default function LeaderPicker({ date, currentLeader, runLeaders, onClose, onSaved }: Props) {
  const [isPending, startTransition] = useTransition()

  function handleSelect(name: string) {
    startTransition(async () => {
      try {
        await saveScheduleLeader(date, name)
        onSaved(name)
        onClose()
      } catch (err) {
        Sentry.captureException(err)
      }
    })
  }

  const sorted = [...runLeaders].sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999))

  return (
    <div className="flex flex-col gap-2 px-4 pb-4">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide px-1">Who leads?</p>
      <div className="bg-white rounded-xl overflow-hidden shadow border border-gray-100">
        {sorted.map(l => {
          const away = isCurrentlyAway(l, date)
          const isSelected = l.name === currentLeader
          return (
            <button
              key={l.id}
              onClick={() => handleSelect(l.name)}
              disabled={isPending}
              className={`w-full flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 touch-manipulation text-left ${isSelected ? 'bg-orange-50' : 'bg-white'}`}
            >
              <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">{l.name[0]}</div>
              <span className="flex-1 text-sm font-medium text-gray-900">{l.name}</span>
              {away && <span className="text-[9px] bg-yellow-50 text-yellow-700 font-bold px-1.5 py-0.5 rounded">Away</span>}
              {isSelected && <span className="text-orange-600 font-bold text-base">✓</span>}
            </button>
          )
        })}
      </div>
      <button onClick={onClose} className="text-sm text-gray-400 font-medium py-1 touch-manipulation">Cancel</button>
    </div>
  )
}
```

- [ ] **Step 3: Wire LeaderPicker into `PlanClient`**

In `PlanClient.tsx`, update the props type to make `runConfig` and `runLeaders` required:

```typescript
type Props = {
  upcoming: ScheduleEntry[]
  variants: WorkoutVariantRow[]
  initialWeekIndex?: number
  isLeader: boolean
  voteData?: Record<string, VoteData | null>
  runConfig: RunConfig
  roster: string[]
  runLeaders: RunLeader[]
}
```

Add state for picker:
```typescript
const [pickerOpen, setPickerOpen] = useState(false)
const [localLeader, setLocalLeader] = useState<string | null>(null)
```

Replace the existing leader display (line ~228):
```tsx
{isLeader && entry && !pickerOpen && (
  <button
    onClick={() => setPickerOpen(true)}
    className="text-left touch-manipulation"
    aria-label="Change leader for this week"
  >
    <div className="text-sm font-semibold text-gray-900 flex items-center gap-1">
      {localLeader ?? entry.leader}
      {entry.needsLeader && <span className="text-[9px] bg-red-50 text-red-600 font-bold px-1.5 py-0.5 rounded">Needs leader</span>}
      {!entry.needsLeader && entry.reassigned && <span className="text-[9px] bg-blue-50 text-blue-600 font-bold px-1.5 py-0.5 rounded">↩ reassigned</span>}
      <span className="text-xs text-orange-600">tap to change</span>
    </div>
  </button>
)}
{isLeader && pickerOpen && entry && (
  <LeaderPicker
    date={entry.date}
    currentLeader={localLeader ?? entry.leader}
    runLeaders={runLeaders}
    onClose={() => setPickerOpen(false)}
    onSaved={(name) => { setLocalLeader(name); setPickerOpen(false) }}
  />
)}
```

Note: `entry.needsLeader` and `entry.reassigned` require adding these fields to `ScheduleEntry` in `lib/data.ts` and mapping them in `fetchSchedule`.

Add to `ScheduleEntry` type in `lib/data.ts`:
```typescript
needsLeader?: boolean
reassigned?: boolean  // true when needs_leader was previously set and then cleared by auto-reassignment
```

Map in `fetchSchedule`:
```typescript
needsLeader: r.needs_leader === true,
// reassigned tracking: not stored in DB currently; omit for now
```

- [ ] **Step 4: Update `buildPost` call in PlanClient to use current leader**

```typescript
const effectiveLeader = localLeader ?? entry.leader
// Pass a modified entry with effectiveLeader for buildPost
const post = entry && effectiveSelections.length > 0
  ? buildPost({ ...entry, leader: effectiveLeader }, effectiveSelections, runConfig, roster, activeType)
  : ''
```

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add components/LeaderPicker.tsx components/PlanClient.tsx app/actions.ts lib/data.ts
git commit -m "feat: LeaderPicker, tappable leader field in Plan, saveScheduleLeader action"
```

---

### Task 10: Verification checkbox

**Files:**
- Modify: `components/PlanClient.tsx`
- Modify: `lib/postBuilder.ts` — add `buildVerificationLabel` export
- Modify: `__tests__/postBuilder.test.ts`

**Reference:** Open `scratch/run-config-final.html` — "Plan page — copy locked" and "tappable leader field" screens.

- [ ] **Step 1: Write failing test for `buildVerificationLabel`**

In `__tests__/postBuilder.test.ts`:

```typescript
import { buildVerificationLabel } from '../lib/postBuilder'

describe('buildVerificationLabel', () => {
  test('quality workout returns intervals-focused label', () => {
    const label = buildVerificationLabel({ ...baseWorkout, type: 'Ladder', rawInput: 'WU: 15min. Main: 3×1K @ 3K pace, 90s rest. CD: 10min.', distTime: '~5mi' })
    expect(label).toContain('3×1K')
    expect(label).toContain('90s rest')
    expect(label).toContain('~5mi')
  })

  test('route workout returns route-focused label', () => {
    const routeWorkout = { ...baseWorkout, type: 'Route', name: 'Kent Ave Loop', distTime: '~6mi' }
    const label = buildVerificationLabel(routeWorkout)
    expect(label).toContain('Kent Ave Loop')
    expect(label).toContain('~6mi')
  })

  test('fallback label when no useful fields', () => {
    const minimal = { ...baseWorkout, rawInput: '', distTime: '', type: 'Easy' }
    const label = buildVerificationLabel(minimal)
    expect(label).toBeTruthy()
    expect(label.length).toBeGreaterThan(5)
  })
})
```

Run: `npm run test:unit -- postBuilder`
Expected: FAIL

- [ ] **Step 2: Implement `buildVerificationLabel` in `lib/postBuilder.ts`**

```typescript
const ROUTE_TYPES = new Set(['Route', 'Easy', 'Long'])
const QUALITY_TYPES = new Set(['Ladder', 'Superset', 'Threshold', 'Intervals', 'Tempo', 'Progression', 'Broken Tempo'])

export function buildVerificationLabel(workout: WorkoutVariantRow): string {
  const dist = workout.distTime ? `, ${workout.distTime}` : ''

  if (ROUTE_TYPES.has(workout.type)) {
    return `I've verified: ${workout.name}${dist}`
  }

  // Extract main interval details from rawInput
  const main = extractMain(workout.rawInput)
  if (main) {
    const condensed = main.length > 60 ? main.slice(0, 60) + '…' : main
    return `I've verified: ${condensed}${dist}`
  }

  return `I've verified: ${workout.name}${dist || ' — key workout details'}`
}
```

Run: `npm run test:unit -- postBuilder`
Expected: PASS

- [ ] **Step 3: Add checkbox to `PlanClient`**

Add state:
```typescript
const [verified, setVerified] = useState(false)
```

Reset on new post generation — in `handleSetPlan`:
```typescript
setSaved(true)
setVerified(false)  // reset checkbox when plan changes
setPlanTab('post')
```

Also reset when week changes:
```typescript
useEffect(() => { setVerified(false) }, [weekIndex])
```

Replace the Copy button section (currently around line 487-498):

```tsx
{(!plannedWorkout || planTab === 'post') && effectiveSelections.length > 0 && (
  <div className="flex flex-col gap-3 p-4">
    <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans leading-relaxed">{post}</pre>
    <div className="flex items-start gap-3 bg-gray-50 rounded-xl px-4 py-3">
      <input
        type="checkbox"
        id="verify-checkbox"
        checked={verified}
        onChange={e => setVerified(e.target.checked)}
        className="mt-0.5 w-4 h-4 shrink-0 accent-orange-600 touch-manipulation"
      />
      <label htmlFor="verify-checkbox" className="text-sm text-gray-600 leading-snug cursor-pointer">
        {effectiveSelections.length > 0 ? buildVerificationLabel(effectiveSelections[0]) : 'I\'ve verified the key workout details'}
      </label>
    </div>
    <button
      onClick={handleCopy}
      disabled={!verified}
      data-tour="heylo-copy"
      className={`flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl font-bold text-sm touch-manipulation transition-opacity ${verified ? 'bg-orange-600 text-white' : 'bg-orange-600 text-white opacity-35 cursor-not-allowed'}`}
    >
      {copied ? <><Check size={16} /> Copied!</> : <><Copy size={16} /> Copy to clipboard</>}
    </button>
  </div>
)}
```

Import `buildVerificationLabel`:
```typescript
import { buildPost, buildVerificationLabel, formatDateLong } from '@/lib/postBuilder'
```

- [ ] **Step 4: TypeScript check + unit tests**

```bash
npx tsc --noEmit && npm run test:unit
```

Expected: zero errors, all pass

- [ ] **Step 5: Commit**

```bash
git add lib/postBuilder.ts components/PlanClient.tsx __tests__/postBuilder.test.ts
git commit -m "feat: verification checkbox gates copy, dynamic label from workout data"
```

---

### Task 11: E2E tests + self-review checklist

**Files:**
- Create: `e2e/run-config.spec.ts`
- Modify: `e2e/plan.spec.ts`

- [ ] **Step 1: Add to `e2e/plan.spec.ts`**

```typescript
test('verification checkbox is required before copy', async ({ page }) => {
  // Sign in as leader, navigate to plan, set a workout
  await page.goto('/plan')
  // ... select a workout and set as plan (reuse existing setup helpers)
  const copyBtn = page.getByRole('button', { name: /copy to clipboard/i })
  await expect(copyBtn).toBeDisabled()

  const checkbox = page.getByRole('checkbox')
  await checkbox.check()
  await expect(copyBtn).toBeEnabled()
})

test('TigerWolves post contains correct branding', async ({ page }) => {
  await page.goto('/plan')
  // ... set a workout as plan
  const post = await page.locator('pre').textContent()
  expect(post).toContain('TigerWolves')
  expect(post).not.toContain('undefined')
  expect(post).not.toContain('null')
})
```

- [ ] **Step 2: Create `e2e/run-config.spec.ts`**

```typescript
import { test, expect } from '@playwright/test'

test.describe('Run Settings', () => {
  test.use({ storageState: 'e2e/.auth/leader.json' })

  test('Run Settings link appears in hamburger menu', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /menu/i }).click()
    await expect(page.getByRole('link', { name: /run settings/i })).toBeVisible()
  })

  test('post template saves and persists', async ({ page }) => {
    await page.goto('/run-config')
    const input = page.getByLabel(/meeting location/i)
    const original = await input.inputValue()
    await input.fill('Test Location Updated')
    await page.getByRole('button', { name: /save changes/i }).click()
    await expect(page.getByRole('button', { name: /saved/i })).toBeVisible()
    // Reload and verify persistence
    await page.reload()
    await expect(page.getByLabel(/meeting location/i)).toHaveValue('Test Location Updated')
    // Restore original
    await input.fill(original)
    await page.getByRole('button', { name: /save changes/i }).click()
  })

  test('away period save shows confirmation banner', async ({ page }) => {
    await page.goto('/run-config')
    await page.getByRole('button', { name: 'Roster' }).click()
    // Open away panel for first leader
    await page.locator('.away-btn').first().click()
    await page.getByLabel('From').fill('2099-01-01')
    await page.getByLabel('To').fill('2099-01-07')
    await page.getByRole('button', { name: /save away period/i }).click()
    await expect(page.getByText(/away period saved/i)).toBeVisible()
  })
})
```

- [ ] **Step 3: Run full test suite**

```bash
npm run test:unit && npm run test:e2e
```

Expected: all pass

- [ ] **Step 4: Self-review against spec**

Go through each AC in issue #310 and confirm it's covered:
- [ ] Plan page detects leader's run via `clerk_user_id` → Task 5
- [ ] Heylo post uses run config (not hardcoded TigerWolves) → Task 4
- [ ] TigerWolves regression → Task 4 snapshot test
- [ ] Library per-run default + cross-run toggle → Task 5
- [ ] Schedule filtered by run → Task 5
- [ ] Run config UI: post template → Task 7
- [ ] Run config UI: leader roster add/remove → Task 8
- [ ] KV reactions surfaced in Plan and Library → already wired in existing code (verify `voteData` passes through with new props)

- [ ] **Step 5: TypeScript clean**

```bash
npx tsc --noEmit
```

Expected: zero errors

- [ ] **Step 6: Open PR**

```bash
gh pr create --title "feat: leader experience for multi-run trial (#310)" --body "$(cat <<'EOF'
## Summary
- Plan, Library, Schedule pages detect and scope to the signed-in leader's run
- `buildPost` fully parameterized from `runs` table — no hardcoded TigerWolves strings
- New Run Settings UI: post template tab + roster tab (rotation order, away periods with retroactive reassignment, add/remove leader)
- Verification checkbox gates Heylo post copy — label is dynamically constructed from workout data
- Rolling 12-week schedule auto-generation via `generateScheduleHorizon`
- TigerWolves output regression snapshot test

## Test plan
### Verified by Claude (automated)
- `npm run test:unit` — rotation logic, postBuilder regression snapshot, db queries
- `npm run test:e2e` — run config UI save, away period confirmation, checkbox gate, TigerWolves branding

### Please verify manually (Lou)
- Sign in as TigerWolves leader → Plan page → generate post → verify byte-for-byte matches current output
- Sign in as a Mourning Doves leader → Plan page → generate post → verify Mourning Doves branding
- Open hamburger → Run Settings → edit post template → save → reload → verify persistence
- Roster tab → mark yourself away for a future date range → verify confirmation banner shows correct count
- Schedule page → confirm no "tap to change" affordance (read-only)
- Plan page → verify Copy button is disabled until checkbox is checked; checkbox resets on new post

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 7: Tell Lou**

> "This PR touches N files. Run `/review` before merging."

---

## Migration checklist (Lou runs after PR is approved, before merging to production)

1. Apply `scripts/migrate-310.sql` to the Preview Neon branch via the Neon REST API
2. Verify columns exist: `runs.leader_intro`, `run_leaders.away_periods`, `run_leaders.email`, `schedule.needs_leader`
3. Confirm TigerWolves `leader_intro` is backfilled to `'Run Leaders:'`
4. Run `npm run test:e2e` against the Preview URL
5. Apply `scripts/migrate-310.sql` to production after merge
