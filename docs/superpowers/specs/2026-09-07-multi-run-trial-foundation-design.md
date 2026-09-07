# Multi-Run Trial Foundation — Design Spec
**Date:** 2026-09-07
**Status:** Approved for implementation planning

---

## What we're building and why

Today the app is TigerWolves-only. After the Sep 12 run leaders meeting, one or more partner NBR runs may agree to a trial. This build makes that trial real.

The problem it solves, from both sides:
- **Runners** click through 4 Heylo screens to find this week's run info. This app puts it front and center.
- **Run leaders** manually post to Heylo every week, often last-minute. This app generates the post and they copy-paste.

**Success picture (4–6 weeks post Sep 12):** a partner run's leaders can log in, plan their workout, and generate a correct Heylo post independently. Runners who do multiple NBR runs see all their upcoming runs in one place, navigable by week. The data model supports any number of runs — this is not hardcoded to one partner run.

---

## Approach — Option B: Foundation first, then two parallel stories

- **Story 1:** DB schema + Clerk auth foundation (unblocks everything)
- **Story 2:** Leader experience (Plan, Library, Schedule, run config UI)
- **Story 3:** Runner experience (signup, My Week, All Runs, per-run pages)

Stories 2 and 3 are dispatched simultaneously after Story 1 merges. They touch different parts of the app and have no file-scope collisions.

---

## Data model

### `runs` table (new)
| Field | Type | Notes |
|---|---|---|
| `id` | `TEXT PK` | slug: 'tigerwolves', 'mourning-doves' |
| `name` | `TEXT NOT NULL` | 'TigerWolves', 'Mourning Doves' |
| `emoji` | `TEXT` | UI display on run cards |
| `description` | `TEXT` | About text on per-run page and All Runs |
| `day_of_week` | `TEXT` | 'Tuesday', 'Wednesday' |
| `meeting_time` | `TEXT` | '6:30 AM' |
| `meeting_location` | `TEXT` | Starting point for the post |
| `warmup_description` | `TEXT` | Default warm-up block; overridable per workout |
| `closing_notes` | `TEXT` | Bag drop, logistics — static per run |
| `post_header` | `TEXT` | Full opening block of the Heylo post |

Future field (not in this build): `banner_photo_url TEXT`.

TigerWolves seeded as the first row. Partner run seeded by Lou via import script at onboarding time.

### `schedule` table
Add: `run_id TEXT NOT NULL DEFAULT 'tigerwolves'`
Backfill all existing TigerWolves entries.

### `run_leaders` table
Add: `clerk_user_id TEXT`
Backfill TigerWolves leaders with their actual Clerk user IDs.

### `workouts` table
Add:
- `run_id TEXT NOT NULL DEFAULT 'tigerwolves'` — backfill all existing workouts
- `warmup_override TEXT` — replaces the run's default warm-up for this specific workout
- `route_description TEXT` — turn-by-turn directions for non-quality (route) runs
- `route_link TEXT` — map link for route runs

### `runner_follows` table (new)
| Field | Type |
|---|---|
| `clerk_user_id` | `TEXT NOT NULL` |
| `run_id` | `TEXT NOT NULL REFERENCES runs(id)` |
| `joined_at` | `TIMESTAMPTZ DEFAULT NOW()` |
| PK | `(clerk_user_id, run_id)` |

---

## Clerk + auth model

- **Self-registration enabled** — Restricted mode disabled so runners can sign up freely.
- **Role system** — leaders get `publicMetadata.role = 'leader'` set by Lou in the Clerk dashboard. Runners have no role metadata (absence = runner).
- **`isLeader` hardened** — changes from `!!userId` to `userId && user.publicMetadata.role === 'leader'` everywhere: `requireAuth()` in `app/actions.ts`, `HeaderAuth`, `LibraryClient`, Plan tab gating.
- **Existing TigerWolves leaders** — Lou sets `role = 'leader'` in Clerk as part of Story 1 rollout.
- **Runner post-signup flow** — after signup, runners land on a "pick your runs" screen before reaching My Week.

**Security note:** disabling Restricted mode is safe only because `isLeader` is now a real role check, not `!!userId`. These two changes must ship together in Story 1.

---

## Heylo post template structure

The post has three layers:

**Static per run** (stored in `runs` table, editable via run config UI):
- Opening block (`post_header`): run name, emoji, branding
- Meeting location (`meeting_location`): where the run starts
- Warm-up destination (`warmup_description`): default, overridable per workout
- Closing notes (`closing_notes`): bag drop, logistics

**Dynamic per workout** (generated at post time by `buildPost`):
- Date of this week's run
- Workout name, type, intervals, rationale
- Warm-up override (if set on the workout)
- Route description + map link (for non-quality runs)

**Dynamic per plan entry:**
- Who leads this week (from the plan entry)
- Full run leader roster (from `run_leaders` table, appended to closing)

`buildPost` in `lib/postBuilder.ts` accepts a run config struct from the DB. No hardcoded TigerWolves strings remain. TigerWolves post output must be byte-for-byte identical to today's (regression test required).

---

## Capabilities

### Leader capabilities (per-run, full parity with TigerWolves today)
- Sign in
- Plan tab: pick a workout, generate and copy correct Heylo post for their run
- Library: view their run's workouts by default; cross-run browse toggle
- Schedule: create, update, delete entries for their run
- Races: shared across all runs, no change
- Run config UI: edit post template sections (header, location, warm-up, closing), manage leader roster (add/remove), update day/time
- Popular workouts surfaced in Plan and Library from KV reaction data (#241 — read-only KV query, no migration)

### Runner capabilities (new)
- Self-serve signup via Clerk
- Post-signup: pick which runs to follow (writes to `runner_follows`)
- My Week: upcoming workouts across joined runs, date strip across top, week-by-week navigation (forward and back)
- Per-run page: upcoming schedule for that run (schedule-first, minimal identity — name, description)
- All Runs directory: discover all platform runs, join or leave
- Cross-run library browse (read-only)

### Runners do not get
- Plan tab or Heylo post generation
- Add/edit/delete in library, schedule, or races
- Run config or admin

### Races
Shared across all runs. No changes to the Races page.

---

## Workout import (partner run onboarding)

Partner runs arrive with their library in some format — spreadsheet, doc, text file. Lou takes their list and runs a per-run import script (similar to `scripts/seed.ts`) to load their workouts into Neon with the correct `run_id`. No file upload UI in the app for the trial. One-time operation per run.

---

## Per-run page design

Schedule-first. The per-run page exists primarily so runners can see upcoming workouts for that run. Structure:
- Run name + emoji at top (minimal)
- Brief description (secondary)
- Upcoming schedule entries in order — workout name, type, date

Not prominent: heavy branding, about section. No photo (future field).

Accessible from: My Week (tap a run card) and All Runs directory.

---

## Design-first requirement for new surfaces

Three surfaces in this build have no existing reference and must go through a design pass before the build agent starts:
- **Run config UI** (Story 2) — editing post template sections, managing leader roster
- **My Week date navigation** (Story 3) — date strip, week-by-week navigation
- **Runner post-signup run picker** (Story 3) — first screen after signup

Design passes happen during grooming for Story 2 and Story 3 respectively. The #302 prototype is the reference for all other runner UI surfaces (All Runs, per-run page, run cards).

---

## Story scopes

### Story 1 — DB + Clerk foundation
**Files:** `scripts/migrate.sql`, `lib/db.ts`, `proxy.ts`, `app/actions.ts`, `components/HeaderAuth.tsx`, `components/LibraryClient.tsx`
**What ships:** all schema migrations, TigerWolves backfill, Clerk role check hardened, Restricted mode disabled, import script for partner run library
**Constraint:** migration SQL is a Lou step after PR merges (agent writes it, Lou runs it via Neon REST API — Auto Mode blocks credential access)

### Story 2 — Leader experience
**Files:** `app/plan/page.tsx`, `components/PlanClient.tsx`, `lib/postBuilder.ts`, `lib/db.ts`, `app/page.tsx`, `components/LibraryClient.tsx`, new run config UI pages/components
**What ships:** Plan detects leader's run via `clerk_user_id` → passes run config to `buildPost`. Schedule filtered by run. Library per-run view + cross-run browse toggle. Run config UI (edit template, manage leader roster). KV reactions surfaced in Plan + Library.

### Story 3 — Runner experience
**Files:** `app/runner/` routes (new), `components/RunnerNav.tsx` (new), `components/MyWeekView.tsx` (new), `components/AllRunsView.tsx` (new), `app/runs/[run_id]/page.tsx` (new), `app/onboarding/page.tsx` (new), `lib/db.ts`
**What ships:** Post-signup run picker. My Week with date navigation. Per-run schedule page. All Runs directory with join/leave. Cross-run library browse. Runner nav on runner routes.

---

## Out of scope (this build)

- Banner/photo upload (future — `banner_photo_url` field not added yet)
- Self-serve run creation UI (Lou seeds new runs via import script + SQL)
- Attendee count / "Going" mechanic
- Run leader pitch tour (#115)
- Library governance / draft → approval flow (#113, #114)
- Runner comments (#267)
- Reactions data migration from KV to Neon (deferred until #267 scopes the engagement model)
- Admin UI for run configuration beyond the run config UI in Story 2

---

## Design decisions

- **N-run scalable from day one.** `run_id` as a slug on every relevant table means adding a third or fourth run is the same operation as adding the second. No code changes needed per run.
- **Lou seeds new runs manually for the trial.** Self-serve onboarding flow (#112, Release 5) comes later once the trial pattern is established.
- **KV reactions stay in KV.** Surfacing them in Plan/Library is a read-only query. Migration deferred until #267 clarifies the engagement model.
- **`isLeader` and Restricted mode change together.** Shipping one without the other creates a security gap.
- **No photo in this build.** Functional value comes from schedule data, not visual identity.
