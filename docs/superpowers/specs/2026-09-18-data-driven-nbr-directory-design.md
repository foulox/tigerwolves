# Design: Data-driven NBR directory (unify into `runs`)

**Date:** 2026-09-18
**Issue:** #365 (splits into #365a + #365b) · supersedes and closes #364
**Status:** Design approved, pending spec review
**Mockups:** [`./2026-09-18-nbr-directory-mockups/`](./2026-09-18-nbr-directory-mockups/) — `1-admin-surface.html`, `2-add-placement.html`, `3-drawer.html`

## What this is

The All Runs page renders a hardcoded 24-entry NBR directory (`lib/allRunsData.ts`) merged with real DB runs. Every directory entry — name, day, time, location, category — is a code constant, so adding a new NBR run, fixing a wrong meeting time, or removing a discontinued one requires a source edit and a deploy.

This work retires the constant. The directory becomes rows in the existing `runs` table, and All Runs renders from that one source. An admin edits the catalog inline on the All Runs page — no code change, no deploy.

## Decisions

These were settled during brainstorming and are not open for the plan to reopen:

- **Unify, don't add a table.** Directory entries become `runs` rows, not a separate `nbr_directory` table. This deletes #360's merge/dedup machinery rather than extending it.
- **Kill #364.** "Signed-out sees real DB runs" was a patch against the constant we're deleting. Once All Runs reads the table for everyone, the signed-out gap closes for free. #364 is absorbed here, not built.
- **Three-state lifecycle: `unclaimed → draft → live`.**
  - `unclaimed` — catalog stub, no leader, muted "More NBR" card, not joinable, no `/runs/[id]` page. *(New.)*
  - `draft` — a leader has claimed it and is setting it up privately; visible, leader-only joinable. *(Exists, #353.)*
  - `live` — public, joinable. *(Exists.)*
- **All Runs is the admin surface**, with always-on inline controls (edit pencil + state badge per card), gated to admin (`publicMetadata.admin === true`) — you only. Regular leaders never see catalog controls.
- **Publish stays on run settings.** Draft → live is the assigned leader's action on the existing run settings screen (`setRunStatus`), not on All Runs.
- **Signed-out visibility:** anonymous visitors see `unclaimed` + `live`; `draft` is hidden (honors #353).
- **Split into two stories** (see below).

## Structure — what changes

| Area | File(s) | Change |
|---|---|---|
| Schema | `scripts/migrate-365.sql` (new) | Add `distance TEXT`; allow `status = 'unclaimed'`; drop `nbr_directory_id` + its index; seed ~22 unclaimed rows |
| Directory data | `lib/allRunsData.ts` | Delete `NBR_RUNS` constant; keep/relocate the day/category mapping helpers still needed |
| Merge logic | `lib/allRuns.ts` | Delete `mergeDirectory`, `dbRunToNbrCard`, the `nbr_directory_id` link path in `computePlatformMap` |
| Reads | `lib/db.ts` | `getDirectoryRuns` returns `distance`, drops `nbr_directory_id`; delete `getActivatedNbrDirectoryIds`; `getRunById` (and the run page) reject `unclaimed` |
| All Runs page | `app/all-runs/page.tsx`, `components/AllRunsClient.tsx` | Render tiers from `status` alone; signed-out reads the table too |
| Admin (365b) | `app/all-runs/*`, `app/admin/actions.ts` | Inline add/edit/remove drawer + activate; replace `createRun`/`activateNbrRun` |
| Old admin screen | `app/admin/runs/*` | Redundant once inline editing lands — retire or leave dormant |

## How it works

### Data model
`runs` gains one column (`distance TEXT`) and one new `status` value (`unclaimed`). The 24 directory entries live as rows: two already exist as `live` runs (`tigerwolves`, `mmer`); the other ~22 are seeded `unclaimed`. Field mapping on seed: `day` → `day_of_week` (`DAY_ABBREV_TO_FULL`), `startTime` → `meeting_time` (normalize `'6:45am'` → display format), `location` → `meeting_location`, `category` → `kind` (`NBR_CATEGORY_TO_KIND`), `distance` → the new `distance` column.

### Render (both audiences)
All Runs reads `getDirectoryRuns()` and classifies by `status`:
- `unclaimed` → "More NBR" tier, muted, not joinable, no link-out.
- `live` → "On the app" (or "Following" if joined).
- `draft` → leader-only joinable card; hidden entirely from anonymous visitors.

The signed-in/signed-out branch collapses: both render from the table. Anonymous simply filters `draft` out. This is the step that absorbs #364.

### Guarding the sweep
An `unclaimed` run must never behave like a live run. Because unclaimed rows have no leader, no schedule, and no page entry point, the guard surface is small:
- `getRunById` / the `/runs/[id]` page returns not-found for `unclaimed`.
- `generateScheduleHorizon` and Heylo post generation are never invoked for `unclaimed` (no trigger exists today, but assert it).

### Admin editing (365b)
- **Add run** — header "+ Add run" button (admin-only) opens the drawer empty. Saves an `unclaimed` row.
- **Edit** — per-card pencil opens the drawer pre-filled. Includes "Remove from catalog."
- **Drawer fields** — name · day · time · location · distance · category.
- **Activate** — "Activate →" on an unclaimed card assigns a leader (by email) and flips the row to `draft`. Replaces `activateNbrRun`, dropping its prefill-from-constant (the row already holds the identity). The leader then publishes from run settings.

## Story split

- **#365a — Data-driven foundation.** Schema + seed + render-from-table + sweep guard + delete the constant and #360 dedup machinery. **No new UI, no visible change** — behavior matches today, sourced from data. Closes #364. Independently shippable and verifiable.
- **#365b — Admin editing on All Runs.** Inline add / edit / remove drawer + activate rework (steps 5–6). Builds on 365a.

Ships 365a first so the risky data migration is verified alone before the admin UI layers on top.

## Design decisions (the "why")

- **Why unify instead of a second table** — a separate `nbr_directory` table would keep the merge/dedup layer alive and grow it. Folding into `runs` deletes that layer: a run *is* its card. It also turns #361's "activate" into a state flip instead of an insert-with-copy.
- **Why a new `status` value, not a boolean** — the lifecycle is genuinely three states on one axis (catalog → private setup → public). A `status` enum already models that axis; a parallel boolean would let contradictory combinations exist.
- **Why `distance` is a new column** — it is the one directory field `runs` never had (`dbRunToNbrCard` renders created runs with a blank distance today). Keeping the brochure's "4–6 mi" line requires storing it.
- **Why inline-on-All-Runs over a separate admin screen** — the whole point of unifying is one model; splitting the admin UI back into a second surface fights that. All Runs is already the truest view of the table.

## Performance impact

Signed-out All Runs shifts from a static constant to a per-request DB read (`getDirectoryRuns`, currently uncached). Small — one indexed table scan of ~24 rows — but it changes a previously-static render path. Consider a short cache for the anonymous read if needed; quantify during the plan.

## Testing

Firmed per story in grooming. Expected shape:
- **365a** — unit tests for `status`-based tier classification (unclaimed → More NBR, live → on-app/following, draft hidden from anonymous); a migration/seed check asserting the ~22 unclaimed rows exist and `tigerwolves`/`mmer` are untouched; a guard test that `getRunById` rejects `unclaimed`. E2e: All Runs renders the catalog signed-out and signed-in.
- **365b** — unit tests for the add/edit/remove actions and activate (unclaimed → draft + leader row); e2e for the inline drawer flow.

Every AC maps to at least one automated check; run command set at grooming.

## Out of scope

- Run lifecycle beyond activate (retire/delete a *live* run, one-time runs) — that is #363.
- Any change to how a leader publishes draft → live (stays on run settings, unchanged).
- Reworking the workout library, schedule generation, or Heylo post format.
- A public "follow/express interest" affordance on unclaimed runs — they are read-only catalog entries.
