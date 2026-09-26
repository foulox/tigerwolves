# Data-driven NBR directory (#365) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the All Runs page from the `runs` table for every visitor, link on-app runs to their run page, and gate draft runs so only their leader or an admin can preview/join them — retiring the hardcoded `NBR_RUNS` constant and #360's merge machinery.

**Architecture:** The 24-entry NBR directory becomes rows in the existing `runs` table (unified model). All Runs reads `getDirectoryRuns()` and classifies each row by `status` (`unclaimed` / `draft` / `live`) crossed with viewer identity (anonymous / runner / owning-leader-or-admin) to decide visibility, joinability, and link-out. The old directory-card-id ↔ run-id indirection (`computePlatformMap`, `mergeDirectory`, `dbRunToNbrCard`) is deleted; every card is keyed on its own `run.id`.

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Neon Postgres (`@neondatabase/serverless`), Clerk auth (`publicMetadata.admin`/`role`), Tailwind, Vitest (unit + test-data DB integration), Playwright (e2e).

**Spec:**
- Issue (canonical): https://github.com/foulox/tigerwolves/issues/365
- Design doc: `docs/superpowers/specs/2026-09-18-data-driven-nbr-directory-design.md` (affordances refined 2026-09-23 — see issue)
- Mockup (final): `docs/superpowers/plans/2026-09-23-nbr-directory-card-states.html` (committed by Task 1; the v4 card-states artifact)

**Depends on:** #445 (normalize run ids to `slugify(name)` — renames `tigerwolves` → `tuesday-morning-tigerwolves`). **#445 must merge first.** Build #365 on a branch cut from `main` *after* #445 lands, so every run's `id === slugify(name)` before the seed runs.

## Global Constraints

- **Never commit to `main`.** Work on a story branch; Lou merges the PR.
- **Migration must be idempotent / replay-safe AND correctly ordered.** `scripts/run-migrate.ts` applies every `migrate-<N>.sql` in **ascending numeric order** on each merge (demo-schema auto-sync). Use `IF NOT EXISTS` / `WHERE NOT EXISTS`. Because #445's rename must run before this seed, **number the seed migration ABOVE #445's** — name it **`migrate-446.sql`**, NOT `migrate-365.sql` (365 < 445 would invert the order and collide). Once ids are uniform (post-#445) the seed dedups by `id`, so this migration **drops `nbr_directory_id`** — honoring the original AC — and the drop is replay-safe because nothing keys on the column anymore.
- **A migration reaches four branches:** Preview (this PR), test-data (`ep-fragrant-sunset`, CI runs `test:unit` here), production (`ep-super-waterfall`, at merge), demo-data (`ep-ancient-math`, at/after merge). Preview + test-data are applied **during the build**; confirm the rows by querying.
- **Auth gates unchanged.** Admin = `publicMetadata.admin === true`. Leader = `publicMetadata.role === 'leader'`. Do not weaken `requireAuth`.
- **Cache:** All Runs is already dynamic (`currentUser()`); reads stay uncached. Any write path still uses `updateTag('tigerwolves-data')` inside a Server Action only.
- **DB access for agents:** use the Neon REST API + `NEON_API_KEY` from `.env.local` (never `neonctl auth`). `.env.local` `DATABASE_URL` is **production** — never seed/test against it.
- **Copy rules:** no "Not on the app yet" text anywhere; no muted "More NBR" styling. Draft badge is amber (`bg-amber-100 text-amber-800`-ish), never green.
- En-dash in distances is `–` (U+2013), matching `NBR_RUNS` today.

---

### Task 1: Story branch + plan + mockup committed

**Files:**
- Create: `docs/superpowers/plans/2026-09-23-data-driven-nbr-directory-365.md` (this file)
- Create: `docs/superpowers/plans/2026-09-23-nbr-directory-card-states.html` (copy of the approved v4 mockup)

**Interfaces:**
- Produces: the story branch and the committed plan+mockup all later tasks build on.

- [ ] **Step 1: Create the story branch**

```bash
git fetch origin main && git switch -c 365-data-driven-nbr-directory origin/main
```

- [ ] **Step 2: Copy the approved mockup so the visual travels to build**

```bash
cp .superpowers/brainstorm/*/content/card-states-v4.html docs/superpowers/plans/2026-09-23-nbr-directory-card-states.html
```
(If `.superpowers/` was cleaned, recreate the mockup from the issue's affordance table — a runner phone and a leader/admin phone; live=tappable+Join, draft/unclaimed=blank inert card, leader/admin draft=amber Draft badge+Join+tappable.)

- [ ] **Step 3: Commit plan + mockup as the first commit on the branch**

```bash
git add docs/superpowers/plans/2026-09-23-data-driven-nbr-directory-365.md docs/superpowers/plans/2026-09-23-nbr-directory-card-states.html
git commit -m "#365: implementation plan + card-states mockup"
```

---

### Task 2: Migration — `distance` column + idempotent seed of the 24 catalog rows + drop `nbr_directory_id`

**Files:**
- Create: `scripts/migrate-446.sql` (numbered above #445's rename — see Global Constraints)
- Test (manual query, Step 5): against Preview + test-data branches

**Interfaces:**
- Produces: `runs.distance TEXT` column; ~22 `status='unclaimed'` rows (24 minus whatever already exists per branch), each keyed on `id = slugify(name)`; `nbr_directory_id` column + its unique partial index **dropped**.

**Context the executor must respect:**
- **#445 has already landed**, so every existing run's `id === slugify(name)`: `tuesday-morning-tigerwolves` (live), `wednesday-mourning-doves` (draft), and on test-data `monday-morning-easy-run` (the realigned MMER fixture).
- Seed **all 24** entries; each row's `id` is `slugify(name)`. The seed dedups on `id` — so the runs that already exist (`tuesday-morning-tigerwolves`, `wednesday-mourning-doves`, test-data's `monday-morning-easy-run`) are skipped, preserving their status/leader/schedule.
- Do **not** write `nbr_directory_id` (the column is being dropped at the end of this migration).
- `runs.id` is a TEXT slug (PK). En-dash in `distance` is `–` (U+2013).

- [ ] **Step 1: Write the migration**

```sql
-- Story #365 (migrate-446.sql — numbered above #445's rename so it applies AFTER it).
-- All Runs renders from the runs table (unified model). Idempotent / replay-safe:
-- ADD ... IF NOT EXISTS; seed guarded by WHERE NOT EXISTS on id; DROP ... IF EXISTS.
-- Run against Preview + test-data during the build; production + demo at/after merge.
-- PRECONDITION: #445 has normalized every run id to slugify(name).

-- 1. New column for the directory distance label (e.g. "4–7 mi").
ALTER TABLE runs ADD COLUMN IF NOT EXISTS distance TEXT;

-- 2. Seed the 24 NBR directory entries as `unclaimed` catalog rows, keyed on
--    id = slugify(name). Any entry already a run (same id, post-#445) is skipped,
--    so tigerwolves/Doves/MMER-fixture keep their real status, leaders, schedules.
INSERT INTO runs (id, name, day_of_week, meeting_time, meeting_location, kind, distance, status)
SELECT v.id, v.name, v.day_of_week, v.meeting_time, v.meeting_location, v.kind, v.distance, 'unclaimed'
FROM (VALUES
  ('monday-morning-easy-run',    'Monday Morning Easy Run',       'Monday',    '6:45am', 'McCarren Park',        'Beginner-Friendly', '3–4 mi'),
  ('monday-night-plyo',          'Monday Night Plyo',             'Monday',    '6:30pm', 'McCarren Park',        'Workout',           'Strength & Cross-Training'),
  ('monday-night-easy-run',      'Monday Night Easy Run',         'Monday',    '7:30pm', 'McCarren Park',        'Beginner-Friendly', '3–4 mi'),
  ('monday-nite-owls',           'Monday Nite Owls',              'Monday',    '9:10pm', 'McCarren Park',        'Long',              '9–10 mi'),
  ('tuesday-morning-tigerwolves','Tuesday Morning Tigerwolves',   'Tuesday',   '6:30am', 'McCarren Park',        'Workout',           '4–7 mi'),
  ('tuesday-bushwick-run',       'Tuesday Bushwick Run',          'Tuesday',   '7:00am', 'Maria Hernandez Park', 'Easy',              '4–6 mi'),
  ('tuesday-lc-tempo',           'Tuesday LC Tempo',              'Tuesday',   '7:00pm', 'Grand Army Plaza',     'Workout',           '4–8 mi'),
  ('tuesday-night-tempo-tnt',    'Tuesday Night Tempo (TNT)',     'Tuesday',   '7:30pm', 'McCarren Park',        'Workout',           '4–7 mi'),
  ('wednesday-mourning-doves',   'Wednesday Mourning Doves',      'Wednesday', '6:00am', 'Tom Stofka Garden',    'Long',              '7–11 mi'),
  ('wednesday-night-beginner-run','Wednesday Night Beginner Run', 'Wednesday', '7:00pm', 'McCarren Park',        'Beginner-Friendly', '2–3 mi'),
  ('wednesday-night-road-run',   'Wednesday Night Road Run',      'Wednesday', '7:30pm', 'McCarren Park',        'Easy',              '4–6 mi'),
  ('wednesday-night-form-run',   'Wednesday Night Form Run',      'Wednesday', '7:30pm', 'Grand Army Plaza',     'Easy',              '3–4 mi'),
  ('thursday-just-south-tempo',  'Thursday ''Just South'' Tempo', 'Thursday',  '6:30am', 'Grand Army Plaza',     'Workout',           '3–5 mi'),
  ('thursday-morning-hellkatz',  'Thursday Morning Hellkatz',     'Thursday',  '6:45am', 'McCarren Track',       'Workout',           '3–5 mi'),
  ('thursday-night-track',       'Thursday Night Track',          'Thursday',  '7:30pm', 'McCarren Track',       'Workout',           '3–5 mi'),
  ('first-friday-salmon-run',    'First Friday Salmon Run',       'Friday',    '7:30am', 'McCarren Park',        'Food',              '1.6 mi'),
  ('second-friday-donut-run',    'Second Friday Donut Run',       'Friday',    '7:30am', 'McCarren & Prospect',  'Food',              '3–4 mi'),
  ('fourth-friday-bagel-run',    'Fourth Friday Bagel Run',       'Friday',    '7:30am', 'McCarren Park',        'Food',              '3 mi'),
  ('third-friday-ice-cream-run', 'Third Friday Ice Cream Run',    'Friday',    '6:00pm', 'McCarren Park',        'Food',              '2–3 mi'),
  ('second-friday-brewery-run',  'Second Friday Brewery Run',     'Friday',    '6:30pm', 'McCarren',             'Food',              '2–4 mi'),
  ('saturday-narwhals',          'Saturday Narwhals',             'Saturday',  '7:00am', 'McCarren Park',        'Long',              '10–22 mi'),
  ('saturday-lc-long-run',       'Saturday LC Long Run',          'Saturday',  '7:15am', 'BP Station',           'Long',              '10–22 mi'),
  ('saturday-bridge-coffee-run', 'Saturday Bridge & Coffee Run',  'Saturday',  '9:00am', 'Williamsburg Bridge',  'Beginner-Friendly', '3–4 mi'),
  ('sunday-funday',              'Sunday Funday',                 'Sunday',    '8:30am', 'McCarren Park',        'Long',              '10–22 mi')
) AS v(id, name, day_of_week, meeting_time, meeting_location, kind, distance)
WHERE NOT EXISTS (SELECT 1 FROM runs r WHERE r.id = v.id);

-- 3. Drop the now-redundant directory link. Safe because #365's code (Tasks 4–8)
--    removes every reader of nbr_directory_id, and the seed above keys on id.
DROP INDEX IF EXISTS runs_nbr_directory_id_key;
ALTER TABLE runs DROP COLUMN IF EXISTS nbr_directory_id;
```

> **Note:** each seeded `id` is exactly `slugifyRunName(name)` — verify with a quick script if unsure, since the seed's dedup and every future `/runs/[id]` URL depend on it.

- [ ] **Step 2: Apply to this PR's Preview Neon branch**

Fetch the Preview branch connection string via the Neon REST API (project `purple-star-02119717`, branch `preview/365-data-driven-nbr-directory`) using `NEON_API_KEY`, then:
```bash
DATABASE_URL="<preview-uri>" MIGRATE_ONLY_HOST="" npx tsx scripts/run-migrate.ts
```
(run-migrate applies base + all migrate-*.sql idempotently.)

- [ ] **Step 3: Apply to the test-data branch (CI runs `test:unit` here)**

```bash
DATABASE_URL="<test-data-uri>" npx tsx scripts/run-migrate.ts   # host ep-fragrant-sunset
```

- [ ] **Step 4: Verify the seed on both branches (evidence, per repo guardrail)**

Query each branch and confirm: `distance` column exists; `nbr_directory_id` column is **gone**; `status='unclaimed'` count is 22 (or as expected); `tuesday-morning-tigerwolves` still `live`, `wednesday-mourning-doves` still `draft` with its schedule intact. Example:
```sql
SELECT status, count(*) FROM runs GROUP BY status ORDER BY status;
SELECT id, status FROM runs WHERE id IN ('tuesday-morning-tigerwolves','wednesday-mourning-doves','tuesday-bushwick-run','monday-morning-easy-run');
SELECT count(*) FROM information_schema.columns WHERE table_name='runs' AND column_name='nbr_directory_id';  -- must be 0
SELECT count(*) FROM schedule WHERE run_id='wednesday-mourning-doves';  -- must be unchanged
```

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate-446.sql
git commit -m "#365: migration — distance column, seed NBR catalog as unclaimed rows, drop nbr_directory_id"
```

---

### Task 3: Pure helpers — `formatMeetingTimeShort` + rewrite `lib/allRuns.ts`

**Files:**
- Modify: `lib/runProfile.ts` (add `formatMeetingTimeShort`)
- Rewrite: `lib/allRuns.ts`
- Rewrite: `__tests__/allRuns.test.ts`

**Interfaces:**
- Consumes: `DirectoryRun` (from `lib/db.ts`, extended in Task 4 — define the shape here as the input type), `DAY_FULL_TO_ABBREV`, `KIND_TO_NBR_CATEGORY`, `parseStartHour` (all in `lib/runProfile.ts`).
- Produces:
  - `formatMeetingTimeShort(raw: string | null | undefined): string` — `'6:30 AM' → '6:30am'`, `'6:00am' → '6:00am'`, null/empty → `''`.
  - `type RunStatus = 'unclaimed' | 'draft' | 'live'`
  - `type DirectoryCard = NBRRun & { status: RunStatus }` (card keyed on the run's own id)
  - `directoryRunToCard(run: DirectoryRunInput): DirectoryCard`
  - `type ViewerContext = { isLoggedIn: boolean; isAdmin: boolean; owningLeaderRunId: string | null; followedRunIds: string[] }`
  - `type Affordance = { visible: boolean; joinable: boolean; linkable: boolean; showDraftBadge: boolean; following: boolean }`
  - `cardAffordance(run: { id: string; status: RunStatus }, viewer: ViewerContext): Affordance`

  Affordance rules (the crux — implement exactly):
  - `canManage = viewer.isAdmin || (viewer.owningLeaderRunId != null && viewer.owningLeaderRunId === run.id)`
  - `visible = run.status === 'draft' ? viewer.isLoggedIn : true` (anonymous never sees draft; unclaimed+live always visible)
  - `following = viewer.followedRunIds.includes(run.id)`
  - `joinable = run.status === 'live' ? viewer.isLoggedIn : run.status === 'draft' ? canManage : false`
  - `linkable = run.status === 'live' ? true : run.status === 'draft' ? canManage : false`
  - `showDraftBadge = run.status === 'draft' && canManage`

- [ ] **Step 1: Write failing tests for `formatMeetingTimeShort`** (in `__tests__/allRuns.test.ts`, keep the existing `parseStartHour` / map-suite tests, delete the `computePlatformMap`/`mergeDirectory`/`dbRunToNbrCard`/`computeTiers`/`legacy link` describe blocks)

```ts
import { formatMeetingTimeShort, directoryRunToCard, cardAffordance } from '../lib/allRuns'

describe('formatMeetingTimeShort', () => {
  test("'6:30 AM' → '6:30am'", () => expect(formatMeetingTimeShort('6:30 AM')).toBe('6:30am'))
  test("'6:00am' passes through", () => expect(formatMeetingTimeShort('6:00am')).toBe('6:00am'))
  test("'7:00 PM' → '7:00pm'", () => expect(formatMeetingTimeShort('7:00 PM')).toBe('7:00pm'))
  test('null → empty', () => expect(formatMeetingTimeShort(null)).toBe(''))
  test('empty → empty', () => expect(formatMeetingTimeShort('')).toBe(''))
})
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run __tests__/allRuns.test.ts` (function not exported)

- [ ] **Step 3: Implement `formatMeetingTimeShort` in `lib/runProfile.ts`**

```ts
// #365: normalize a stored meeting_time to the compact directory display form.
// DB rows are inconsistent ('6:30 AM' vs '6:00am'); the card always shows '6:30am'.
export function formatMeetingTimeShort(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw.trim().replace(/\s+(AM|PM)$/i, (_, m) => m.toLowerCase()).replace(/\s+/g, '')
}
```
Re-export from `lib/allRuns.ts`, or import in the test from `runProfile`. (Plan re-exports it from `allRuns.ts` for a single import site: add `export { formatMeetingTimeShort } from './runProfile'`.)

- [ ] **Step 4: Run → PASS**

- [ ] **Step 5: Write failing tests for `directoryRunToCard` + `cardAffordance`**

```ts
const row = (o = {}) => ({ id: 'tue-bushwick', name: 'Tuesday Bushwick Run', day_of_week: 'Tuesday',
  meeting_time: '7:00am', meeting_location: 'Maria Hernandez Park', kind: 'Easy', emoji: null,
  distance: '4–6 mi', status: 'unclaimed', ...o })

describe('directoryRunToCard', () => {
  test('maps DB row to a card keyed on run.id, with status + distance', () => {
    const c = directoryRunToCard(row())
    expect(c.id).toBe('tue-bushwick')
    expect(c.day).toBe('tue'); expect(c.category).toBe('Easy Runs')
    expect(c.startTime).toBe('7:00am'); expect(c.startHour).toBe(7)
    expect(c.distance).toBe('4–6 mi'); expect(c.status).toBe('unclaimed')
  })
  test('normalizes DB-format meeting_time', () => {
    expect(directoryRunToCard(row({ id: 'tigerwolves', meeting_time: '6:30 AM' })).startTime).toBe('6:30am')
  })
})

const viewer = (o = {}) => ({ isLoggedIn: true, isAdmin: false, owningLeaderRunId: null, followedRunIds: [], ...o })

describe('cardAffordance', () => {
  test('live: visible, linkable everyone, joinable when logged in', () => {
    const a = cardAffordance({ id: 'x', status: 'live' }, viewer())
    expect(a).toMatchObject({ visible: true, linkable: true, joinable: true, showDraftBadge: false })
  })
  test('live linkable even when logged out', () => {
    expect(cardAffordance({ id: 'x', status: 'live' }, viewer({ isLoggedIn: false })).linkable).toBe(true)
  })
  test('unclaimed: visible, never joinable/linkable', () => {
    expect(cardAffordance({ id: 'x', status: 'unclaimed' }, viewer())).toMatchObject({ visible: true, joinable: false, linkable: false })
  })
  test('draft for a plain runner: visible but inert', () => {
    expect(cardAffordance({ id: 'd', status: 'draft' }, viewer())).toMatchObject({ visible: true, joinable: false, linkable: false, showDraftBadge: false })
  })
  test('draft hidden from anonymous', () => {
    expect(cardAffordance({ id: 'd', status: 'draft' }, viewer({ isLoggedIn: false })).visible).toBe(false)
  })
  test('draft for the owning leader: managed', () => {
    expect(cardAffordance({ id: 'd', status: 'draft' }, viewer({ owningLeaderRunId: 'd' })))
      .toMatchObject({ visible: true, joinable: true, linkable: true, showDraftBadge: true })
  })
  test('draft for an admin: managed for any draft', () => {
    expect(cardAffordance({ id: 'd', status: 'draft' }, viewer({ isAdmin: true })))
      .toMatchObject({ joinable: true, linkable: true, showDraftBadge: true })
  })
  test('following reflects the followed set', () => {
    expect(cardAffordance({ id: 'x', status: 'live' }, viewer({ followedRunIds: ['x'] })).following).toBe(true)
  })
})
```

- [ ] **Step 6: Run → FAIL**

- [ ] **Step 7: Rewrite `lib/allRuns.ts`** — delete `dbRunToNbrCard`, `mergeDirectory`, `computePlatformMap`, `computeTiers`, `PlatformInfo`, `DbRunRow`. Add the types + `directoryRunToCard` + `cardAffordance` per the Interfaces block. `directoryRunToCard` mirrors the old `dbRunToNbrCard` but adds `distance` (pass-through) and `status`, and runs `startTime` through `formatMeetingTimeShort`.

- [ ] **Step 8: Run → PASS** — `npx vitest run __tests__/allRuns.test.ts`

- [ ] **Step 9: Commit**

```bash
git add lib/allRuns.ts lib/runProfile.ts __tests__/allRuns.test.ts
git commit -m "#365: rewrite All Runs classification — status + viewer affordance, drop merge machinery"
```

---

### Task 4: `lib/db.ts` — `getDirectoryRuns` shape, `getRunById` rejects unclaimed, drop `getActivatedNbrDirectoryIds`

**Files:**
- Modify: `lib/db.ts` (`DirectoryRun` type ~776, `getDirectoryRuns` ~788, `getActivatedNbrDirectoryIds` ~807, `getRunById` ~740)
- Test: `__tests__/db.test.ts` (add unclaimed-rejection case if the suite runs on test-data)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `DirectoryRun` now `= { id; name; day_of_week; meeting_time; meeting_location; kind; emoji; status; distance }` (drop `nbr_directory_id` from the **returned** shape; the column stays in the DB).
  - `getDirectoryRuns()` SELECT adds `distance`, drops `nbr_directory_id`.
  - `getRunById(runId)` returns `null` when `status === 'unclaimed'`.
  - `getActivatedNbrDirectoryIds` deleted.

- [ ] **Step 1: Update `DirectoryRun` + `getDirectoryRuns`** — add `distance: string | null` to the type and `SELECT ... distance`; remove `nbr_directory_id` from both the type and the `.map`.

- [ ] **Step 2: Make `getRunById` reject unclaimed** — after building the row, before returning:

```ts
if ((r.status as string | null) === 'unclaimed') return null
```

- [ ] **Step 3: Delete `getActivatedNbrDirectoryIds`** (and its `#361` comment).

- [ ] **Step 4: Typecheck** — `npx tsc --noEmit` will now flag `getActivatedNbrDirectoryIds`/`nbr_directory_id` consumers; those are fixed in Tasks 5–8. Note the breakages, don't chase them yet.

- [ ] **Step 5: Commit**

```bash
git add lib/db.ts
git commit -m "#365: getDirectoryRuns returns distance (drops nbr_directory_id); getRunById rejects unclaimed; drop getActivatedNbrDirectoryIds"
```

---

### Task 5: All Runs page — read the table for everyone, build viewer context

**Files:**
- Modify: `app/all-runs/page.tsx`

**Interfaces:**
- Consumes: `getDirectoryRuns`, `getFollowedRunIds`, `getLeaderRun` (`lib/db`), `currentUser` (Clerk).
- Produces: renders `<AllRunsClient runs={visibleRuns} viewer={viewer} initialFollowedIds={followedIds} serverDate showIntro />` where `runs: DirectoryRun[]` and `viewer: { isLoggedIn, isAdmin, owningLeaderRunId }`.

- [ ] **Step 1: Rewrite the data assembly** — both audiences read the table; anonymous drops draft rows server-side:

```ts
const user = await currentUser()
const isLoggedIn = !!user
const isLeader = user?.publicMetadata?.role === 'leader'
const isAdmin = user?.publicMetadata?.admin === true
const serverDate = new Date().toISOString().slice(0, 10)

const dbRuns = await getDirectoryRuns()
let followedIds: string[] = []
let owningLeaderRunId: string | null = null
if (user) {
  followedIds = await getFollowedRunIds(user.id)
  if (isLeader) owningLeaderRunId = (await getLeaderRun(user.id))?.id ?? null
}
// Anonymous never sees draft rows.
const visibleRuns = isLoggedIn ? dbRuns : dbRuns.filter(r => r.status !== 'draft')
const showIntro = shouldShowIntro(isLoggedIn, followedIds.length)
```

- [ ] **Step 2: Pass the new props** to `AllRunsClient` (Task 6 defines the prop contract). Keep `<Header title="All Runs" isLeader={isLeader} />`.

- [ ] **Step 3: Remove dead imports** — `NBR_RUNS`, `mergeDirectory`, `computePlatformMap`, `PlatformInfo`.

- [ ] **Step 4: Commit** (may not typecheck until Task 6; commit together with Task 6 if cleaner)

```bash
git add app/all-runs/page.tsx
git commit -m "#365: All Runs page reads the table for all viewers; builds viewer context"
```

---

### Task 6: `AllRunsClient` — render from `DirectoryRun` + affordances; link-outs; retire "Not on the app yet" + disabled Join

**Files:**
- Modify: `components/AllRunsClient.tsx`

**Interfaces:**
- Consumes: `DirectoryRun` (`lib/db`), `directoryRunToCard`, `cardAffordance`, `type ViewerContext`, `type DirectoryCard` (`lib/allRuns`), `toggleRunFollow` (`app/actions`).
- Props: `{ runs: DirectoryRun[]; viewer: { isLoggedIn: boolean; isAdmin: boolean; owningLeaderRunId: string | null }; initialFollowedIds: string[]; serverDate: string; showIntro?: boolean }`.

- [ ] **Step 1: Rework props + state** — replace `platform`/`isLoggedIn`/`NBRRun` wiring. Build cards once: `const cards = runs.map(directoryRunToCard)`. Hold `followed` as a `Set`/record seeded from `initialFollowedIds`. Build a `viewer` object each render: `{ ...viewer, followedRunIds: [...followedSet] }`.

- [ ] **Step 2: Replace `runAffordance`** with affordance-driven rendering. For each card compute `const a = cardAffordance(card, viewer)`. Skip cards where `!a.visible`. Right side:
  - `a.joinable` → the Join/Joined toggle button (existing orange/green styles).
  - else if `a.showDraftBadge` → still render Join (managers can join) — badge is rendered on the card body, not the right side.
  - else → **render nothing** (no "Not on the app yet", no disabled button).

- [ ] **Step 3: Make the row link-out when `a.linkable`** — wrap the time+body region in `<Link href={`/runs/${card.id}`} …>` (mirror the Following-tier pattern already in the file), keeping the Join button outside the link so it doesn't navigate. Non-linkable rows stay plain `<div>`.

- [ ] **Step 4: Draft badge** — when `a.showDraftBadge`, render a small amber pill (`bg-amber-100 text-amber-800`) reading `Draft` on the card body (above/beside the name). Never green.

- [ ] **Step 5: Following tier + intro** — Following tier now filters `cards` by `followed.has(card.id)` and renders links to `/runs/${card.id}` (drop the `platform[r.id].runId` indirection). Keep the intro box unchanged.

- [ ] **Step 6: Delete the `NBRRun` import** if unused; import `DirectoryCard` type instead. Verify no reference to `platform`, `p.draft`, `p.runId` remains.

- [ ] **Step 7: Typecheck + unit** — `npx tsc --noEmit` (page + client should now compile except for the admin retirees in Task 7); `npx vitest run __tests__/allRuns.test.ts`.

- [ ] **Step 8: Commit**

```bash
git add components/AllRunsClient.tsx app/all-runs/page.tsx
git commit -m "#365: AllRunsClient renders from status+affordance — live link-outs, draft gating, no 'Not on the app yet'"
```

---

### Task 7: Run page — gate `draft` to owning-leader/admin

**Files:**
- Modify: `app/runs/[id]/page.tsx`

**Interfaces:**
- Consumes: `getRunById` (now returns null for unclaimed), `getLeaderRun`, `currentUser`.
- Produces: `/runs/[id]` returns the not-found view for `unclaimed` (via null) and for `draft` unless the viewer is the owning leader or an admin.

- [ ] **Step 1: Write the guard** — after resolving `runConfig` (already null-guarded for unclaimed) and computing `isOwningLeader`, add `isAdmin` and gate draft:

```ts
const isAdmin = user?.publicMetadata?.admin === true
if (runConfig.status === 'draft' && !isOwningLeader && !isAdmin) {
  return (
    <div>
      <Header title="Run not found" isLeader={false} />
      <p className="px-4 text-gray-500">We couldn&apos;t find that run.</p>
    </div>
  )
}
```
Place it after `isOwningLeader` is known (needs the leader lookup). Keep `RunFollowToggle`'s `joinable={runConfig.status !== 'draft' || isOwningLeader || isAdmin}`.

- [ ] **Step 2: Verify (live)** — sign in as the Clerk test leader (`PLAYWRIGHT_TEST_*`) via a throwaway Playwright script against the Preview URL; confirm `/runs/wednesday-mourning-doves` renders for you (admin) and 404s for a signed-out visit. (Or assert via the e2e spec in Task 9.)

- [ ] **Step 3: Commit**

```bash
git add app/runs/[id]/page.tsx
git commit -m "#365: run page 404s draft runs for non-leader/non-admin viewers"
```

---

### Task 8: Retire the constant-based activate flow + delete `NBR_RUNS`

**Files:**
- Delete: `app/admin/activate-run/page.tsx`, `components/ActivateRunForm.tsx`, `__tests__/activateNbrRun.test.ts`
- Modify: `app/admin/actions.ts` (delete `activateNbrRun`; drop the `NBR_RUNS` import; simplify `insertRun` if its `nbrDirectoryId` param is now unused by any caller — **createRun stays**)
- Modify: `lib/allRunsData.ts` (delete `NBR_RUNS` constant and `nbrRunToIdentity`; keep the `NBRRun` type if still imported anywhere, else remove)
- Modify: `components/Header.tsx` (remove the "Activate an NBR Run" `UserButton.Link`, ~line 66)
- Modify: `app/admin/runs/page.tsx` (filter out `unclaimed` so the manage view still lists only real runs)
- Modify: `scripts/seed-e2e.ts` — remove every `nbr_directory_id` reference so test-data doesn't resurrect the dropped column. Post-#445 these are: the `ALTER TABLE ADD COLUMN` (line 116), the unique index (lines 121–122), and the two `UPDATE ... SET nbr_directory_id` lines (273–274, already repointed to the new ids by #445). Grep `rg -n nbr_directory_id scripts/seed-e2e.ts` to confirm none remain.

**Interfaces:**
- Consumes: nothing new.
- Produces: build no longer references `NBR_RUNS`, `nbrRunToIdentity`, `activateNbrRun`, or `getActivatedNbrDirectoryIds`. `createRun` + `/admin/create-run` still work (creates a `draft` run).

**Rationale (state it in the commit):** activate-via-constant is replaced by #365b's inline activate on unclaimed rows; its only inputs (the deleted constant + `nbr_directory_id` picker) are gone. Retiring it now is forced by the constant deletion, not new feature work.

- [ ] **Step 1: Delete the activate surface** — the two component/page files and the test file. Grep to confirm no other importer: `rg -l "ActivateRunForm|activateNbrRun|nbrRunToIdentity|NBR_RUNS|getActivatedNbrDirectoryIds" -g '*.ts' -g '*.tsx'` returns nothing outside the files this task edits.

- [ ] **Step 2: Edit `app/admin/actions.ts`** — remove `activateNbrRun`, the `NBR_RUNS` import, and `resolveClerkUserByEmail`/`leaderDisplayName`/`grantLeaderRole` imports if now unused (check — `grantLeaderRole` may be used elsewhere; only drop truly-unused ones). If `insertRun`'s `nbrDirectoryId` param is now only ever `undefined`, drop the param and the `nbr_directory_id` column from its INSERT is **optional** — safest is to keep inserting `NULL` explicitly so `createRun` behavior is unchanged. Keep `createRun` intact.

- [ ] **Step 3: Edit `lib/allRunsData.ts`** — delete `NBR_RUNS` and `nbrRunToIdentity`. Keep `type NBRRun` only if still imported (Task 6 may have switched to `DirectoryCard`); otherwise remove it and the now-dead imports (`RunIdentityValues`, etc.).

- [ ] **Step 4: Edit `components/Header.tsx`** — remove the `isAdmin`-gated "Activate an NBR Run" link block. Leave "Create a Run" and "Manage Runs".

- [ ] **Step 5: Edit `app/admin/runs/page.tsx`** — after `const runs = await getDirectoryRuns()`, add `.filter(r => r.status !== 'unclaimed')` so the manage list stays real-runs-only.

- [ ] **Step 6: Typecheck** — `npx tsc --noEmit` must now be clean.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "#365: retire constant-based activate flow (replaced by #365b); delete NBR_RUNS"
```

---

### Task 9: Update e2e specs for the new affordances

**Files:**
- Modify: `e2e/all-runs.spec.ts`, `e2e/doves.spec.ts` (and skim `e2e/admin.spec.ts` for activate-run references)

**Interfaces:**
- Consumes: the seeded test-data catalog (Task 2 applied the migration to test-data; `seed-e2e.ts` preserves the unclaimed rows — it upserts only the fixture runs and never deletes catalog rows).

- [ ] **Step 1: Read the current specs** and identify assertions that no longer hold: any `Not on the app yet` text expectation, any `follow-disabled-*` (draft disabled button) testid, any `/admin/activate-run` navigation.

- [ ] **Step 2: Update assertions** —
  - Signed-out: All Runs shows `live` + `unclaimed` cards; no `draft` (Doves absent); a `live` card links to `/runs/[id]`.
  - Signed-in runner: `draft`/`unclaimed` cards render with no Join button and are not links; `live` cards link out and show Join/Joined.
  - Admin/owning-leader: the Doves `draft` card shows a `Draft` badge, is joinable, and links to `/runs/wednesday-mourning-doves`.
  - Remove/replace any activate-run e2e steps (surface deleted in Task 8).

- [ ] **Step 3: Run e2e** — `npm run test:e2e` locally (needs a populated `.env.test`) or rely on CI on the PR. If run locally, target the affected specs: `npx playwright test e2e/all-runs.spec.ts e2e/doves.spec.ts`.

- [ ] **Step 4: Commit**

```bash
git add e2e/
git commit -m "#365: e2e — assert new All Runs affordances (link-outs, draft gating, no 'Not on the app yet')"
```

---

### Task 10: Full verification + PR

**Files:** none (verification + PR)

- [ ] **Step 1: Full typecheck + unit** — `npx tsc --noEmit` clean; `npx vitest run` green (DB-touching suites skip locally, run on test-data in CI).
- [ ] **Step 2: Grep for stragglers** — `rg "NBR_RUNS|mergeDirectory|dbRunToNbrCard|computePlatformMap|getActivatedNbrDirectoryIds|Not on the app yet" -g '*.ts' -g '*.tsx' app lib components e2e` returns nothing.
- [ ] **Step 3: Confirm migration on Preview + test-data one more time** (query counts) — no `column ... does not exist` on the Preview URL, catalog renders.
- [ ] **Step 4: Live smoke on Preview** — signed-out sees the catalog with live link-outs and no Doves; sign in as the test leader/admin and confirm Doves shows the Draft badge + joins + links; a plain runner sees Doves inert.
- [ ] **Step 5: Open the PR** with **Test plan (Claude)** and **Manual steps (Lou)** sections + the full AC list. Note the migration must be applied to **production** and **demo-data** at merge (plain `run-migrate.ts` apply; no full `refresh-demo.ts` needed). Tell Lou: "This PR touches many files. Run `/review` before merging." End with `gh pr merge <N> --squash --delete-branch`.

---

## Self-Review

**Spec coverage (issue #365 AC → task):**
- All Runs from `runs` for all visitors → Tasks 4,5,6. ✅
- `distance` column + `unclaimed` status + ~22 seeded, tigerwolves/Doves preserved → Task 2. ✅ (MMER→unclaimed in prod is the corrected reality; noted.)
- Runner/anon view: live tappable+Join, draft/unclaimed inert blank, no "Not on the app yet", no muted "More NBR" → Tasks 3,6. ✅
- Anonymous never sees draft; signed-in runner sees draft inert → Tasks 3,5,6. ✅
- Leader/admin: draft badge + Join + link → Tasks 3,6,7. ✅
- `/runs/[id]` 404s unclaimed + draft(non-manager) → Tasks 4,7. ✅
- Integration guard: activate/create-run/runs survive → Task 8 (activate retired, create-run kept, runs filtered). ✅
- Migration on Preview + test-data, rows confirmed → Task 2 (prod+demo at merge, Task 10). ✅

**Deviations from the issue AC (flag to Lou before merge):**
1. **`nbr_directory_id` IS dropped** (honors the AC), but only because prerequisite **#445** normalizes every run id to `slugify(name)` first — so the seed dedups by `id` and the drop is replay-safe. This story therefore **depends on #445 landing first**, and its migration is `migrate-446.sql` (numbered above #445's `migrate-445.sql`).
2. **MMER seeds `unclaimed` in production** (issue said "mmer stays live") — MMER was never a run in prod; correct outcome, but contradicts the AC's wording. Confirmed with Lou (not onboarded).
3. **`/admin/activate-run` retired now** rather than in #413/#365b — forced by the constant deletion; the gap is harmless (Doves already activated; inline activate returns in #413).

**Placeholder scan:** none — every code step has real content.

**Type consistency:** `DirectoryRun` (db.ts) → input to `directoryRunToCard` → `DirectoryCard` (allRuns.ts) → consumed by AllRunsClient; `ViewerContext.followedRunIds` supplied by the client each render; `cardAffordance` signature stable across Tasks 3/6. `formatMeetingTimeShort` defined in runProfile, re-exported from allRuns. ✅
