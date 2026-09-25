# Normalize run ids (#445) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the flagship run so its identity matches its NBR-directory identity — `name` `'TigerWolves'` → `'Tuesday Morning Tigerwolves'` and `id` `'tigerwolves'` → `'tuesday-morning-tigerwolves'` — so every run's `id === slugifyRunName(name)` and #365 can seed the catalog + drop `nbr_directory_id` cleanly.

**Architecture:** A single primary-key rename cascaded across the four `run_id`-bearing tables, plus the matching `name` update and the one runtime link + the test-data fixtures. Three FKs get `ON UPDATE CASCADE` so the PK change repoints their children automatically; `run_leaders` (no FK) is repointed by hand. The migration is numbered `migrate-445.sql` so it applies before #365's `migrate-446.sql`.

**Tech Stack:** Neon Postgres (`@neondatabase/serverless`), `scripts/run-migrate.ts`, Next.js App Router, Vitest (incl. test-data DB integration), Playwright.

**Spec:**
- Issue (canonical): https://github.com/foulox/tigerwolves/issues/445
- Downstream: #365 (`docs/superpowers/plans/2026-09-23-data-driven-nbr-directory-365.md`) depends on this.

## Global Constraints

- **Never commit to `main`.** Story branch; Lou merges.
- **Idempotent / replay-safe.** `run-migrate.ts` applies every `migrate-<N>.sql` in ascending numeric order on each merge. Use `DROP CONSTRAINT IF EXISTS` + `ADD`; the `UPDATE ... WHERE id='tigerwolves'` statements are no-ops once renamed. Base `scripts/migrate.sql` is **left untouched** — it still seeds/updates `'tigerwolves'` (it runs before this migration in every pass; this file renames at the end). Do not change the base seed or its `WHERE id='tigerwolves'` UPDATEs, or a fresh-DB build would apply that config to a nonexistent id.
- **Migration reaches four branches:** Preview + test-data during the build; production + demo at merge.
- **The single new run id is `tuesday-morning-tigerwolves`** = `slugifyRunName('Tuesday Morning Tigerwolves')`. The single new name is `Tuesday Morning Tigerwolves`.
- **Do NOT touch:** the `'tigerwolves-data'` cache tag, the `foulox/tigerwolves` GitHub URLs, `tigerwolves.foulox.me`, the Heylo `post_header` (`🐯🐺 TigerWolves ...` — a separate field, intentionally keeps the brand), or the `🐯🐺` emoji.
- **No `/runs/tigerwolves` redirect** — Lou has accepted the new URL; old-URL preservation is explicitly out of scope.
- **`nbr_directory_id` stays** in this story (still read by the live #360 machinery until #365 removes it). This migration must NOT drop it.

---

### Task 1: Story branch + plan committed

**Files:** Create `docs/superpowers/plans/2026-09-25-normalize-run-ids-445.md` (this file)

- [ ] **Step 1: Branch**
```bash
git fetch origin main && git switch -c 445-normalize-run-ids origin/main
```
- [ ] **Step 2: Commit the plan**
```bash
git add docs/superpowers/plans/2026-09-25-normalize-run-ids-445.md
git commit -m "#445: implementation plan"
```

---

### Task 2: Rename migration (`migrate-445.sql`)

**Files:**
- Create: `scripts/migrate-445.sql`
- Verify (Step 4): Preview + test-data via query

**Interfaces:**
- Produces: the `tigerwolves` run renamed to id `tuesday-morning-tigerwolves` / name `Tuesday Morning Tigerwolves`, with `schedule` / `runner_follows` / `run_workouts` / `run_leaders` rows repointed; the three FKs carry `ON UPDATE CASCADE`; `schedule.run_id` default repointed.

**Context:** FKs on `runs(id)` = `schedule.run_id`, `runner_follows.run_id`, `run_workouts.run_id` (all `ON UPDATE NO ACTION` originally; `run_workouts` also `ON DELETE CASCADE`). `run_leaders.run_id` has **no** FK. No other table has a `run_id` column (votes live in KV, not a runs FK).

- [ ] **Step 1: Write the migration**

```sql
-- Story #445: normalize the flagship run to its NBR-directory identity.
--   name 'TigerWolves'  -> 'Tuesday Morning Tigerwolves'
--   id   'tigerwolves'  -> 'tuesday-morning-tigerwolves'  (= slugify(name))
-- Idempotent/replay-safe. Applies AFTER base migrate.sql (which still builds the
-- 'tigerwolves' row); this file (445) is numbered above all current migrations.

-- 1. Give the three run_id FKs ON UPDATE CASCADE so the PK rename repoints children.
ALTER TABLE schedule       DROP CONSTRAINT IF EXISTS schedule_run_id_fk;
ALTER TABLE schedule       ADD  CONSTRAINT schedule_run_id_fk       FOREIGN KEY (run_id) REFERENCES runs(id) ON UPDATE CASCADE;
ALTER TABLE runner_follows DROP CONSTRAINT IF EXISTS runner_follows_run_id_fkey;
ALTER TABLE runner_follows ADD  CONSTRAINT runner_follows_run_id_fkey FOREIGN KEY (run_id) REFERENCES runs(id) ON UPDATE CASCADE;
ALTER TABLE run_workouts   DROP CONSTRAINT IF EXISTS run_workouts_run_id_fkey;
ALTER TABLE run_workouts   ADD  CONSTRAINT run_workouts_run_id_fkey  FOREIGN KEY (run_id) REFERENCES runs(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- 2. run_leaders has NO FK — repoint it explicitly (no-op once renamed).
UPDATE run_leaders SET run_id = 'tuesday-morning-tigerwolves' WHERE run_id = 'tigerwolves';

-- 3. Rename the PK + the display name. The three FKs cascade the id to their children.
UPDATE runs SET id = 'tuesday-morning-tigerwolves', name = 'Tuesday Morning Tigerwolves' WHERE id = 'tigerwolves';

-- 4. Repoint the schedule default off the old id (legacy backfill artifact).
ALTER TABLE schedule ALTER COLUMN run_id SET DEFAULT 'tuesday-morning-tigerwolves';
```

- [ ] **Step 2: Apply to the Preview branch** — fetch the `preview/445-normalize-run-ids` connection URI via the Neon REST API (`NEON_API_KEY`), then:
```bash
DATABASE_URL="<preview-uri>" npx tsx scripts/run-migrate.ts
```
- [ ] **Step 3: Apply to test-data** (`ep-fragrant-sunset`):
```bash
DATABASE_URL="<test-data-uri>" npx tsx scripts/run-migrate.ts
```
- [ ] **Step 4: Verify (evidence) on both branches** — the run renamed, children repointed, nothing orphaned:
```sql
SELECT id, name FROM runs WHERE id = 'tuesday-morning-tigerwolves';   -- 1 row, new name
SELECT count(*) FROM runs WHERE id = 'tigerwolves';                    -- 0
SELECT
  (SELECT count(*) FROM schedule       WHERE run_id='tigerwolves') AS sched_old,
  (SELECT count(*) FROM runner_follows WHERE run_id='tigerwolves') AS foll_old,
  (SELECT count(*) FROM run_workouts   WHERE run_id='tigerwolves') AS rw_old,
  (SELECT count(*) FROM run_leaders    WHERE run_id='tigerwolves') AS lead_old;  -- all 0
SELECT count(*) FROM schedule WHERE run_id='tuesday-morning-tigerwolves';        -- was 117 on prod
```
- [ ] **Step 5: Commit**
```bash
git add scripts/migrate-445.sql
git commit -m "#445: rename tigerwolves run to Tuesday Morning Tigerwolves (id + name, FK cascade)"
```

---

### Task 3: Fix the one runtime link

**Files:** Modify `components/AllRunsClient.tsx:185`

**Interfaces:** the intro-box "See the TigerWolves schedule →" link points at the renamed run.

- [ ] **Step 1:** Change `href="/runs/tigerwolves"` → `href="/runs/tuesday-morning-tigerwolves"`. (Only this literal — leave the visible "TigerWolves" link text and everything else.) This is the sole runtime `run-id` literal in app code; `rg -n "runs/tigerwolves" app lib components` must return nothing after.
- [ ] **Step 2: Commit**
```bash
git add components/AllRunsClient.tsx
git commit -m "#445: point the intro schedule link at the renamed run"
```

---

### Task 4: Realign the test-data fixtures (`seed-e2e.ts`)

**Files:** Modify `scripts/seed-e2e.ts`

**Interfaces:** the fixture recreated each e2e run uses the new ids, so test-data matches the migrated schema and #365's later dedup works.

Rename **two** fixtures — do NOT touch the display name of MMER (already `'Monday Morning Easy Run'`), only its id; rename BOTH the id and name of tigerwolves.

- [ ] **Step 1: tigerwolves fixture** (~line 224) — `INSERT INTO runs (...) VALUES ('tigerwolves', 'TigerWolves', ...)` → `('tuesday-morning-tigerwolves', 'Tuesday Morning Tigerwolves', ...)`. Keep the emoji, post_header, meeting fields.
- [ ] **Step 2: mmer fixture** (~line 247) — `'mmer', 'Monday Morning Easy Run'` → `'monday-morning-easy-run', 'Monday Morning Easy Run'` (id only).
- [ ] **Step 3: Repoint every `run_id` literal** to the new ids (verified spots): the `DELETE FROM run_leaders`/`runner_follows` IN-lists (~157, ~163); the `nbr_directory_id` UPDATEs (~257–258 — set them `WHERE id='tuesday-morning-tigerwolves'` and `WHERE id='monday-morning-easy-run'` so the live #360 machinery keeps lighting up the cards in the interim); the `run_leaders` INSERT rows (~288–290, ~296); the `schedule` INSERT rows (~306–314, ~321); and any `run_workouts` membership inserts keyed on these ids. Grep to confirm: `rg -n "'tigerwolves'|'mmer'" scripts/seed-e2e.ts` returns only the harmless `console.log` summary (update that string too for accuracy).
- [ ] **Step 4: Run the seed against test-data** to prove it applies clean:
```bash
DATABASE_URL="<test-data-uri>" npx tsx scripts/seed-e2e.ts
```
Then re-verify Task 2 Step 4's queries still hold (fixtures land under the new ids).
- [ ] **Step 5: Commit**
```bash
git add scripts/seed-e2e.ts
git commit -m "#445: realign e2e fixtures to normalized run ids (tigerwolves + mmer)"
```

---

### Task 5: Convention test + downstream test literals

**Files:**
- Create/extend a DB-integration test asserting the convention (e.g. `__tests__/runIdConvention.test.ts`)
- Modify: `e2e/entry-routing.spec.ts` (lines 27, 38)
- Modify: `__tests__/myPlan.test.ts`, `__tests__/postTemplateTokens.test.ts` (fixture ids — consistency)
- **Do NOT touch** `__tests__/allRuns.test.ts` — it's rewritten in #365.

**Interfaces:** a regression guard that every run id follows `slugifyRunName(name)`.

- [ ] **Step 1: Write the failing convention test** (mirrors the `adminRunsData.test.ts` `skipIf(!onTestData)` pattern so it only runs against test-data / CI):

```ts
import { describe, test, expect } from 'vitest'
import { sql } from '../lib/db'
import { slugifyRunName } from '../lib/runIdentity'

const TEST_DATA_HOST = 'ep-fragrant-sunset-atmdps9n-pooler.c-9.us-east-1.aws.neon.tech'
const onTestData = (process.env.DATABASE_URL ?? '').includes(TEST_DATA_HOST)

describe.skipIf(!onTestData)('every run id follows slugify(name)', () => {
  test('id === slugifyRunName(name) for all runs', async () => {
    const runs = await sql`SELECT id, name FROM runs`
    const offenders = runs.filter(r => r.id !== slugifyRunName(r.name as string))
    expect(offenders.map(r => `${r.id} != slugify(${r.name})`)).toEqual([])
  })
})
```

- [ ] **Step 2: Run against test-data → PASS** (post-migration + seed):
```bash
DATABASE_URL="<test-data-uri>" npx vitest run __tests__/runIdConvention.test.ts
```
(If it fails, the offender list names the row to fix — likely a missed fixture in Task 4.)

- [ ] **Step 3: Update `e2e/entry-routing.spec.ts`** — `setFollow(page, 'tigerwolves', …)` → `'tuesday-morning-tigerwolves'` (lines 27, 38).

- [ ] **Step 4: Update the isolated unit fixtures** — `__tests__/myPlan.test.ts` and `__tests__/postTemplateTokens.test.ts` use `id: 'tigerwolves'` as arbitrary fixtures; set them to `'tuesday-morning-tigerwolves'` (and the `name` to `'Tuesday Morning Tigerwolves'` where a name is set) for consistency. These don't touch the DB, so they can't break — but the grep must come back clean.

- [ ] **Step 5: Grep clean** — `rg -n "'tigerwolves'|\"tigerwolves\"|runs/tigerwolves" -g '*.ts' -g '*.tsx' app lib components scripts e2e __tests__ | rg -v "tigerwolves-data|foulox|allRuns.test"` returns nothing.

- [ ] **Step 6: Commit**
```bash
git add __tests__/runIdConvention.test.ts e2e/entry-routing.spec.ts __tests__/myPlan.test.ts __tests__/postTemplateTokens.test.ts
git commit -m "#445: id-convention regression test + update downstream test literals"
```

---

### Task 6: Full verification + PR

- [ ] **Step 1: Typecheck + unit** — `npx tsc --noEmit` clean; `npx vitest run` green (DB suites run on test-data in CI, skip locally).
- [ ] **Step 2: Live smoke on Preview** — the run page resolves at `/runs/tuesday-morning-tigerwolves` and shows the "Tuesday Morning Tigerwolves" title; All Runs still lights up that card and the intro link taps through; a followed account still shows it joined (follows cascaded).
- [ ] **Step 3: Confirm no regression in the live #360 directory** — because `nbr_directory_id` is unchanged (`tue-tigerwolves`) and now points at the renamed run, the old machinery still dedups/links correctly in this pre-#365 interim.
- [ ] **Step 4: Open the PR** with **Test plan (Claude)** + **Manual steps (Lou)** + the AC list. Note: apply the migration to **production** and **demo-data** at merge (plain `run-migrate.ts`), and that **#365 must branch from `main` after this merges**. Tell Lou "This PR touches several files. Run `/review` before merging." End with `gh pr merge <N> --squash --delete-branch`.

---

## Self-Review

**Spec coverage (issue #445 AC → task):**
- Every run `id === slugify(name)`, asserted by a test → Task 5. ✅
- `tigerwolves` renamed (id + name), FK children repointed, no orphans → Task 2. ✅
- `seed-e2e.ts` MMER fixture → `monday-morning-easy-run`; tigerwolves fixture renamed → Task 4. ✅
- No remaining `'tigerwolves'` literal run-id in app/seeds/tests → Tasks 3–5 (+ grep gate). ✅
- Applied to Preview + test-data; prod + demo at merge → Tasks 2, 6. ✅
- `nbr_directory_id`'s only remaining readers are #360's (removed by #365) → not touched here. ✅

**Refinements vs. the issue body (note at PR):**
1. The fix is a **name + id** rename, not id-only — the run's stored name (`TigerWolves`) differed from its NBR-directory name, and that (not the id) was the real mismatch. Renaming the name to `Tuesday Morning Tigerwolves` is what makes `id === slugify(name)` hold and keeps the All Runs card label full (it would otherwise shrink to "TigerWolves" once #365 reads the DB).
2. **Base `migrate.sql` is deliberately not edited** (it builds `'tigerwolves'` before this migration renames it — replay-safe).
3. **No redirect** for the old URL (Lou declined).

**Placeholder scan:** none. **Type consistency:** the new id `tuesday-morning-tigerwolves` and name `Tuesday Morning Tigerwolves` are used identically across migration, seed, link, and tests; `slugifyRunName` is the single convention source. ✅
