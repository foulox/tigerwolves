## Session Brief — Personal — 2026-08-16

---

### tigerwolves

**Open PRs:**

- None open — #285 (closes #276) merged 2026-08-17

**Bugs** (open, always priority):

- #284 Can't fix organized by club member on NYC marathon
- #279 label-only variation text posts as the entire workout (backlog)

**Ready to build:**

- None labeled

**Up next** (awaiting your `ready-to-build`):

- #277 Rewire write paths from (name, variation) keys to variant_id — groomed 2026-08-17, split into 3 build-ordered parts (Library CRUD+flags → Schedule → Regroup) inside one issue

**Current milestone:** Data Foundation Sprint — 4/9 closed

**Roadmap** (from the wiki's Release Roadmap page):

- **Data Foundation Sprint** (Epic #271, Epic #267) — *Get the workout library's and runner feedback's data models structurally right before Release 4 multiplies how much data exists across more runs.*

  - *Active sequence* (Epic #271 — Workout Data Model Rebuild, per 2026-08-09 comment):
    - - [ ] #277 Rewire write paths from (name, variation) keys to variant_id ← groomed 2026-08-17, `up-next`, awaiting `ready-to-build`. Split into 3 build-ordered parts within one issue: Part A (Library CRUD + flags — includes rebuilding `EditWorkoutForm`, which is a dead stub since #274, not a rewire target), Part B (Schedule — small, `resolveWorkoutVariant` already exists from #276), Part C (Regroup). Votes (`lib/votes.ts`) confirmed permanently out of scope. Not treated as time-sensitive — usage is low right now, which is the whole reason for doing this migration now.
  - *Done this release:*
    - - [X] ~~#272 Schema migration — run_groups/workout_families/workout_variants/routes~~
    - - [X] ~~#273 Semantic layer definition for the workout schema~~ (PR #281)
    - - [X] ~~#274 Write path — new workouts enter new schema, AI-suggested turnaround~~ (PR #282)
    - - [X] ~~#275 Backfill existing library into workout_families/workout_variants~~ (PR #283 — 70/70 legacy workouts verified backfilled in production)
    - - [X] ~~#276 Rewire buildPost + turnaround display to read from workout_variants~~ (PR #285, merged 2026-08-17)
  - *Paused / deferred*:
    - #278 Cutover — retire the legacy workouts table — backlog (deliberately deferred weeks out, per its own scope)
    - #267 Epic: Runner Comments — backlog (no epic comment yet setting a build order vs. #271)
    - #253 Runner reaction notes — capture/read/delete — backlog (foundation story for #267). **Schema updated 2026-08-17** during #277 grooming: `reaction_comments.workout_id` changed from a `name||variation` string to `variant_id INT REFERENCES workout_variants(id)` — now has a hard dependency on #277 shipping first, called out explicitly in its own Sequencing section.
    - #268 Runner Comments — presence badges — backlog
    - #269 Runner Comments — leader inbox/header icon/archive — backlog
    - #270 Runner Comments — categorization and durability — backlog
- **Release 3 — Cleanup & Hardening** (Epic #231) — *Resolve small-but-real issues before Release 4 genericization grooming starts.*

  - Remaining open (all backlog, ungroomed): #241 Surface popular/well-liked workouts, #254 In-app workout preference surveys, #255 Claude-assisted race verification & enrichment, #259 Review which CLAUDE.md/skill tasks should become GitHub Actions
  - #172, #209, #226, #234 have shipped (all CLOSED on GitHub) since the wiki table was last updated — still listed there as open, worth a strikethrough pass
- **Release 4 — Run Series Foundation** (Epic #102) — *Everything hardcoded to TigerWolves becomes per-run-series config.* Waiting on Release 3 cleanup to finish so grooming happens against a complete picture. #165 (privacy/access gate) must land before real routes from another run enter the shared Library.
- **Release 5 — Second Run Onboarding** (Epic #103) / **Release 6 — Training Context** (Epic #104) — not started, both depend on Release 4.

**Needs grooming** (backlog issues not in any release table):

- #165 Runner access request + approval flow — unhomed orphan from closed Release 2, must land before/alongside Release 4's route data

**Wiki out of date:** #172/#209/#226/#234 shipped but still shown as open in the Release 3 table (see above)

---

### claude-memory / devops

**Ready to build:**

- None labeled

**Up next:**

- None labeled

**Backlog:**

- None labeled

---

**Memory vitals:** 49 files, 837 lines, MEMORY.md 68 lines — ✓ healthy

---

**Last session:** Groomed #277 (write-path migration to `variant_id`) — audited every call site against real code (not just the epic's sketch), found the scope bigger/differently-shaped than assumed (dead `EditWorkoutForm` stub, live split-brain between `addWorkout`/`addVariation`), re-split into 3 build-ordered parts, rewrote the issue body to full story format, moved `backlog` → `up-next`. Also found and fixed a schema problem in sibling issue #253 (different epic) — its planned `reaction_comments` table would have inherited the same string-key fragility #277 retires — rewrote its schema to key off `variant_id` and added an explicit dependency on #277. 1 item staged in claude-memory's `pending-decisions.md` for next PM triage (candidate grooming-process improvement: scan other open issues for schema/keying assumptions before finalizing a story that changes a shared pattern).

---

## Sub-session log

- 2026-08-16 1808 — 276-grooming: groomed #276 to `ready-to-build`; resolved turnaround-gate conflict, backfill verification, PlanClient scope, and edit-drift risk; rewrote issue body to full story format. Next: build session picks up #276.
- 2026-08-17 0808 — 276-build: PR #285 opened, `/code-review` run (3 fixed, 1 confirmed as #277's scope), manually verified on Preview. Next: Lou merges #285, then #277 grooming.
- 2026-08-17 1026 — 277-grooming: groomed #277 to `up-next` (8 decisions, re-split into 3 parts, rewrote issue body); also fixed #253's schema (variant_id instead of name||variation) and added its new dependency on #277. Next: Lou reviews #277 for `ready-to-build`.

---

## Hook candidates
