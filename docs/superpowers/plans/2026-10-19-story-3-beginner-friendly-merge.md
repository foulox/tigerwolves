# Story 3 — Merge Beginner-Friendly into Easy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `Beginner-Friendly` as a distinct run **kind** and fold its runs into `Easy` — a data migration plus a taxonomy cleanup across the run-profile vocabulary, the NBR directory, and the run editor.

**Architecture:** `Beginner-Friendly` is a run `kind`, not a workout-library category; `kindToCategory` already maps it (and `Easy`) to `'Easy'`, so the library/picker behaviour is already identical. The split only exists at the run level (the `runs.kind` column) and in the NBR directory taxonomy. This story (1) migrates the data (`UPDATE runs SET kind='Easy'` + fixes the seed), (2) drops `Beginner-Friendly` from the shared vocabulary (`RUN_KINDS`, `KIND_TO_CATEGORY_MAP`, `NBRCategory`, `KIND_TO_NBR_CATEGORY`, `NBR_CATEGORY_TO_KIND`), and (3) removes it from the two UI spots that hardcode it (the directory category chips, the run-editor kind list). Runs formerly in that kind list under "Easy Runs" in the directory.

**Tech Stack:** Next.js App Router, React client components, Postgres (Neon) via `scripts/run-migrate.ts`, vitest (node-env) for the pure vocabulary, Playwright for the directory e2e.

**Spec:** `docs/superpowers/specs/2026-10-18-axis-aware-picker-redesign-design.md`

## Global Constraints

- **Independent of the Model C stories (1A/1B/2/4)** — touches no picker code. Can build in parallel with #532.
- **Idempotent, replay-safe migration** — the repo has no migration-tracking table; every migration must be a no-op on a second run (`scripts/run-migrate.ts` replays the whole set). A constant `UPDATE … WHERE kind='Beginner-Friendly'` is idempotent (zero rows match on replay).
- **Migration reaches four branches** — Preview + **test-data** (CI unit tests run against test-data) during the build; **production** + **demo-data** at/after merge. `sync-demo-schema.yml` auto-replays migrations to demo on merge, so demo picks it up with no manual step. The PR will be auto-flagged `data-model-change` (it touches `scripts/migrate*.sql`); the migration is a safe constant UPDATE, so the "let auto-apply run" path is correct.
- **No behaviour change** beyond the merge: Easy runs behave exactly as before; `kindToCategory('Easy')==='Easy'` is unchanged.

## Review Focus

- **A run previously `Beginner-Friendly` now appears under "Easy Runs" in the directory, not a missing/empty section.** (Pinned by Task 2 + the directory e2e in Task 4.)
- **The run editor no longer offers `Beginner-Friendly` as a kind**, and editing an existing (now-Easy) run shows `Easy` selected. (Task 2 + Preview check.)
- **`RUN_KINDS` and `KIND_TO_NBR_CATEGORY` no longer contain `Beginner-Friendly`.** (Pinned by Task 1 unit tests.)
- **The migration is idempotent** — running `run-migrate` twice leaves zero `Beginner-Friendly` rows and errors nowhere. (Task 3 verification runs it, then re-checks.)
- **No e2e asserts a `Beginner-Friendly` directory chip / section.** (Task 4 greps + runs `all-runs` / `admin-directory` specs.)

---

### Task 1: Drop `Beginner-Friendly` from the shared vocabulary + tests

**Files:**
- Modify: `lib/runProfile.ts` (`RUN_KINDS`:10, `KIND_TO_CATEGORY_MAP`:44, `NBRCategory`:113, `KIND_TO_NBR_CATEGORY`:116, `NBR_CATEGORY_TO_KIND`:124)
- Modify: `__tests__/runProfile.test.ts` (lines ~30, ~76-78, ~118-120)
- Modify: `__tests__/allRuns.test.ts` (line ~113)

- [ ] **Step 1: Update the tests to the post-merge expectations (write the failing test)**

In `__tests__/runProfile.test.ts`, remove the three `Beginner-Friendly` assertions (the `isWorkoutKind('Beginner-Friendly')`, the "maps Beginner-Friendly to Easy" test, and the "Beginner-Friendly run accepts an Easy-category workout" test) and add, in the appropriate describe blocks:

```ts
test('Beginner-Friendly is no longer a run kind', () => {
  expect((RUN_KINDS as readonly string[]).includes('Beginner-Friendly')).toBe(false)
  expect(KIND_TO_NBR_CATEGORY['Beginner-Friendly']).toBeUndefined()
})

test('Easy still maps to the Easy library category and the Easy Runs directory group', () => {
  expect(kindToCategory('Easy')).toBe('Easy')
  expect(KIND_TO_NBR_CATEGORY['Easy']).toBe('Easy Runs')
})
```

Ensure `RUN_KINDS` and `KIND_TO_NBR_CATEGORY` are imported at the top of the test file (add to the existing import from `../lib/runProfile`). In `__tests__/allRuns.test.ts`, delete the `expect(KIND_TO_NBR_CATEGORY['Beginner-Friendly']).toBe('Beginner-Friendly')` assertion (line ~113).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit -- runProfile allRuns`
Expected: FAIL — `RUN_KINDS` still includes `'Beginner-Friendly'` and `KIND_TO_NBR_CATEGORY['Beginner-Friendly']` is still defined.

- [ ] **Step 3: Remove `Beginner-Friendly` from `lib/runProfile.ts`**

- `RUN_KINDS` (line 10): delete the `'Beginner-Friendly',` entry.
- `KIND_TO_CATEGORY_MAP` (line 44): delete the `'Beginner-Friendly': 'Easy',` entry.
- `NBRCategory` (line 113): change the union to `'Easy Runs' | 'Long Runs' | 'Food Runs' | 'Workouts'` (drop `'Beginner-Friendly'`).
- `KIND_TO_NBR_CATEGORY` (line 116): delete the `'Beginner-Friendly': 'Beginner-Friendly',` entry.
- `NBR_CATEGORY_TO_KIND` (line 124): delete the `'Beginner-Friendly': 'Beginner-Friendly',` entry.
- Update the comment at line 38 to drop the "`Beginner-Friendly` and `Easy` both map" phrasing (now just `Easy`).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit -- runProfile allRuns`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/runProfile.ts __tests__/runProfile.test.ts __tests__/allRuns.test.ts
git commit -m "feat(#534): drop Beginner-Friendly from the run-kind vocabulary"
```

---

### Task 2: Remove `Beginner-Friendly` from the UI + the directory type

**Files:**
- Modify: `components/AllRunsClient.tsx` (`Category` type:32, `CATEGORIES`:41)
- Modify: `components/RunEditorDrawer.tsx` (kind-options array:11)
- Modify: `lib/allRunsData.ts` (`NBRRun.category` union:9)

- [ ] **Step 1: Directory category chips (`AllRunsClient.tsx`)**

- Line 32: `type Category = 'All' | 'Easy Runs' | 'Long Runs' | 'Food Runs' | 'Workouts'` (drop `'Beginner-Friendly'`).
- Line 41: `const CATEGORIES: Category[] = ['All', 'Easy Runs', 'Long Runs', 'Food Runs', 'Workouts']`.

The `card.category !== catFilter` filter (line ~193) and the chip rendering (line ~312) need no other change — removing the literal removes the chip, and migrated runs now carry `'Easy Runs'`.

- [ ] **Step 2: Run editor kind list (`RunEditorDrawer.tsx`)**

Delete the `'Beginner-Friendly',` entry from the hardcoded kind-options array at line 11. (Consider sourcing this list from `RUN_KINDS` to prevent future drift; if that's a clean one-liner, do it — otherwise just remove the entry.)

- [ ] **Step 3: Directory data type (`lib/allRunsData.ts`)**

Line 9: change `category: 'Beginner-Friendly' | 'Easy Runs' | …` to `category: 'Easy Runs' | 'Long Runs' | 'Food Runs' | 'Workouts'`.

- [ ] **Step 4: Verify compile + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. Confirm nothing else references the removed literal:

```bash
rg -n "Beginner-Friendly" lib components app | rg -v "^\s*//"
```
Expected: no non-comment matches (stray comments in `postBuilder.ts`/`ScheduleClient.tsx` may be updated for tidiness but aren't functional).

- [ ] **Step 5: Commit**

```bash
git add components/AllRunsClient.tsx components/RunEditorDrawer.tsx lib/allRunsData.ts
git commit -m "feat(#534): drop Beginner-Friendly from directory chips + run editor"
```

---

### Task 3: Migrate the data

**Files:**
- Create: `scripts/migrate-501.sql`
- Modify: `scripts/migrate-446.sql` (the four seed rows' `kind`)

- [ ] **Step 1: Write the forward migration**

Create `scripts/migrate-501.sql`:

```sql
-- #534: Merge the Beginner-Friendly run kind into Easy. Beginner-Friendly was a
-- redundant kind (any such run is also an Easy run; the two already mapped to the
-- same library category). Idempotent: zero rows match on replay.
UPDATE runs SET kind = 'Easy' WHERE kind = 'Beginner-Friendly';
```

- [ ] **Step 2: Fix the seed so a fresh replay doesn't reintroduce the kind**

In `scripts/migrate-446.sql`, change the `kind` value of the four seeded rows (`monday-morning-easy-run`, `monday-night-easy-run`, `wednesday-night-beginner-run`, `saturday-bridge-coffee-run`) from `'Beginner-Friendly'` to `'Easy'`. (These INSERTs are `ON CONFLICT DO NOTHING`, so on an already-seeded DB they're no-ops and the 501 UPDATE does the real work; on a fresh DB they now seed `Easy` directly.)

- [ ] **Step 3: Apply to the test-data branch and verify idempotency**

Run `run-migrate` against the **test-data** branch (host-guarded), then confirm zero Beginner-Friendly rows and that a second run is a clean no-op:

```bash
# test-data connection string via the Neon REST API (see CLAUDE.md Tooling Notes)
DATABASE_URL=<test-data-conn> MIGRATE_ONLY_HOST=ep-fragrant-sunset npx tsx scripts/run-migrate.ts
DATABASE_URL=<test-data-conn> MIGRATE_ONLY_HOST=ep-fragrant-sunset npx tsx scripts/run-migrate.ts  # replay → no-op
```
Then query: `SELECT count(*) FROM runs WHERE kind='Beginner-Friendly';` → expect `0`.

- [ ] **Step 4: Run the unit suite against test-data (CI's target)**

Run: `npm run test:unit`
Expected: green (CI runs unit tests against the test-data branch — confirm the vocabulary change + data agree).

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate-501.sql scripts/migrate-446.sql
git commit -m "feat(#534): migrate Beginner-Friendly runs to Easy (+ fix seed)"
```

---

### Task 4: Preview verification, directory e2e, docs, PR

**Files:** none (verification). Push the branch for a Vercel Preview (its Neon preview branch gets the migration via the normal preview flow — apply it to the preview branch as part of this step if the deploy doesn't).

- [ ] **Step 1: Apply the migration to the PR's Preview Neon branch**

Fetch the Preview branch connection string (Neon REST API, project `purple-star-02119717`) and run `run-migrate` against it, so the Preview URL isn't left on stale data. Confirm `SELECT count(*) FROM runs WHERE kind='Beginner-Friendly'` → `0`.

- [ ] **Step 2: Full local gate + directory e2e**

Run: `npx tsc --noEmit && npm run lint && npm run test:unit && npm run test:e2e -- all-runs admin-directory`
Expected: green. First confirm no spec hardcodes the removed chip:

```bash
rg -n "Beginner|category-chip-beginner" e2e
```
Expected: no matches.

- [ ] **Step 3: Preview checks (signed-in leader)**

- The **All Runs directory** shows the four formerly-Beginner-Friendly runs under **Easy Runs**; there is **no** Beginner-Friendly category chip.
- The **run editor** kind dropdown no longer offers Beginner-Friendly; opening one of those runs shows **Easy** selected.

- [ ] **Step 4: Docs + PR**

- Update the **Architecture Overview** / **Leader Guide** wiki if either enumerates run kinds or directory categories (drop Beginner-Friendly).
- Open the PR (it will auto-get the `data-model-change` label + checklist). Note in the PR that the migration is a safe constant UPDATE, so the demo-data **auto-apply** path on merge is correct — no `refresh-demo.ts` re-fork needed. Apply the migration to **production** and confirm demo picked it up (via `sync-demo-schema.yml`) after merge. Include **Test plan (Claude)** + **Manual steps (Lou)** + the AC list; tell Lou the file count and that `/review` should run before merge.

---

## Self-Review

**Spec coverage:** Implements the spec's "Beginner-Friendly → Easy merge" section in full: the migration (both the UPDATE and the seed fix), the `RUN_KINDS` / `kindToCategory` / `KIND_TO_NBR_CATEGORY` / `NBRCategory` removals, and the directory + editor UI. The spec's note that the two kinds already map identically for the library is why no picker/library code changes.

**Placeholder scan:** `#534` (the Story 3 issue number, assigned at PUBLISH) is the one intentional placeholder. Every code/SQL step shows real content. No TODOs.

**Type consistency:** `NBRCategory` (minus Beginner-Friendly) is consumed by `AllRunsClient` and `allRuns.ts`; the `Category` union in `AllRunsClient` and the `NBRRun.category` union in `allRunsData.ts` are updated to match in Task 2, so no stranded literal remains. `RUN_KINDS`/`KIND_TO_NBR_CATEGORY` imports added to the tests match their source.

**Review Focus:** vocabulary-removal is pinned by Task 1 tests; migration idempotency by Task 3's double-run + count; directory-shows-under-Easy and editor-no-longer-offers by Task 2 + the Task 4 Preview/e2e checks; the no-stray-e2e-chip concern by the Task 4 grep. Section complete.
