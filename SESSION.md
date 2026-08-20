## Session Brief — Personal — 2026-08-16

---

### tigerwolves

**Open PRs:**

- #289 Show complete workout info on Plan/Library/Schedule cards (closes #288) — awaiting review/merge
- #287 Add PR template splitting Claude's tests from Lou's manual verification — awaiting review/merge

**Bugs** (open, always priority):

- #290 Run /code-review on #286/#287; consolidate duplicated workout-detail fields across Plan/Library/Schedule (not yet on project board)
- #284 Can't fix organized by club member on NYC marathon
- #279 label-only variation text posts as the entire workout (backlog)

**Ready to build:**

- None labeled

**Up next** (awaiting your `ready-to-build`):

- None — #277 built and in PR #286 (see Open PRs)

**Current milestone:** Data Foundation Sprint — 4/9 closed

**Roadmap** (from the wiki's Release Roadmap page):

- **Data Foundation Sprint** (Epic #271, Epic #267) — *Get the workout library's and runner feedback's data models structurally right before Release 4 multiplies how much data exists across more runs.*

  - *Active sequence* (Epic #271 — Workout Data Model Rebuild, per 2026-08-09 comment): none open — #277 merged, see below. #278 (cutover) remains, deliberately deferred.
  - *Done this release:*
    - - [X] ~~#272 Schema migration — run_groups/workout_families/workout_variants/routes~~
    - - [X] ~~#273 Semantic layer definition for the workout schema~~ (PR #281)
    - - [X] ~~#274 Write path — new workouts enter new schema, AI-suggested turnaround~~ (PR #282)
    - - [X] ~~#275 Backfill existing library into workout_families/workout_variants~~ (PR #283 — 70/70 legacy workouts verified backfilled in production)
    - - [X] ~~#276 Rewire buildPost + turnaround display to read from workout_variants~~ (PR #285, merged 2026-08-17)
    - - [X] ~~#277 Rewire write paths from (name, variation) keys to variant_id~~ (PR #286, merged 2026-08-20). Built as all 3 parts together (Library CRUD+flags, Schedule, Regroup) rather than split across PRs — grooming's "PR-per-part is fine" framing missed that they're coupled through Library's shared read path (flagged for PM triage in claude-memory's `pending-decisions.md`). Votes (`lib/votes.ts`) confirmed permanently out of scope, untouched.
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

**Last session:** #277 merged (PR #286). Same session also: (1) root-caused and fixed a Neon free-tier compute-quota exhaustion blocking #277's own tests — Sentry's built-in Uptime Monitoring was pinging production every minute, 24/7 (see `project_neon_quota_sentry_uptime.md`); (2) found and fixed a month-long silent regression where PR test plans stopped splitting "Verified by Claude" from "Please verify manually, Lou" — fixed via memory, a wiki Contributing.md section, `.github/PULL_REQUEST_TEMPLATE.md`, and a `PreToolUse` hook that blocks non-compliant `gh pr create`/`gh pr edit` calls (PR #287); (3) built #288 (workout-card info display) end-to-end including a live correction and a real bug `/code-review` caught (PR #289); (4) cleaned up #277's merged branch plus a second, older stale branch/Neon-branch pair left over from #276's merge that nobody had cleaned up since 2026-08-17; (5) filed #290 for deferred follow-up work (review #286/#287, consolidate the now-3x-duplicated workout-detail field list). 3 items staged in claude-memory's `pending-decisions.md` for next PM triage (project-board adds for #288/#290, the stale-branch-cleanup gap, and whether long single-window sessions like this one should periodically re-anchor to a fresh `agent-session-start`).

---

## Sub-session log

- 2026-08-16 1808 — 276-grooming: groomed #276 to `ready-to-build`; resolved turnaround-gate conflict, backfill verification, PlanClient scope, and edit-drift risk; rewrote issue body to full story format. Next: build session picks up #276.
- 2026-08-17 0808 — 276-build: PR #285 opened, `/code-review` run (3 fixed, 1 confirmed as #277's scope), manually verified on Preview. Next: Lou merges #285, then #277 grooming.
- 2026-08-17 1026 — 277-grooming: groomed #277 to `up-next` (8 decisions, re-split into 3 parts, rewrote issue body); also fixed #253's schema (variant_id instead of name||variation) and added its new dependency on #277. Next: Lou reviews #277 for `ready-to-build`.
- 2026-08-17/19 0935 — 277-build: PR #286 opened — built all 3 parts together (found mid-build they're coupled, not independently shippable); also root-caused and fixed a Neon compute-quota exhaustion (Sentry Uptime Monitor pinging production every minute) that was blocking this story's own test runs. Full verification passing (tsc, lint, 201 unit tests, 20 e2e tests, Preview). Next: Lou reviews PR #286.
- 2026-08-19/20 — process-fix: found PR test plans had silently stopped splitting "Verified by Claude" from "Please verify manually, Lou" for about a month (#235 through #285) — fixed via memory, Contributing.md, `.github/PULL_REQUEST_TEMPLATE.md`, and a `PreToolUse` hook blocking non-compliant `gh pr create`/`gh pr edit`. PR #287 opened.
- 2026-08-20 — 288-build: filed and built #288 (instructions + coach's notes always visible on Plan/Library/Schedule cards, everything else behind "Show details"); live correction from Lou (coach's notes over reason); `/code-review` caught and fixed a real gap in Library's family rows. PR #289 opened, stacked on #277's branch, then rebased onto `main` after #286 merged.
- 2026-08-20 — close-out: #286 merged; cleaned up its branch/worktree plus a stale #276 branch/Neon-branch pair left over since 2026-08-17; filed #290 for deferred review/refactor work. Next: Lou reviews #287 and #289; a future session picks up #290.

---

## Hook candidates
