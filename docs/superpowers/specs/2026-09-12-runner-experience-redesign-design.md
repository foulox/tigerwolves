# Runner Experience — Design Update

**Date:** 2026-09-12
**Status:** Approved for story breakdown (build deferred until the leader-experience stories complete)
**Supersedes (runner portions of):** `2026-09-07-multi-run-trial-foundation-design.md`
**Epic:** runner side of the multi-run trial (sibling to #320 "Run Leader Experience"); target story #311

---

## Why this update exists

The runner experience was specified on 2026-09-07 and a clickable prototype shipped (#302). Since then the leader side evolved the data model and interaction patterns underneath it — enough that the old runner design is stale in specific, concrete ways. This document re-grounds the runner experience in what the app actually is today and breaks it into buildable stories.

**What changed under the old spec:**

1. **Runs now have a `kind` + `workout_types` allowlist (#318/#321/#322).** `kind` drives *post shape* on the leader side. The runner read surfaces were designed only for the "Workout" shape — they have no rendering for an Easy/route run. The read side needs "shape by kind" too, mirroring what #322 did for posts.
2. **The workout data model was rebuilt (#271/#277/#278).** The `workouts` table is retired; everything is `workout_families` / `workout_variants` / `run_groups`. Runner read queries use the new model.
3. **Two "All Runs" exist, neither real.** `app/all-runs/` (#303) is a public, hardcoded marketing directory (`lib/allRunsData.ts`, 24 NBR runs). `app/runner/all-runs/` is the #302 prototype on demo data. The design converges them into one real, auth-aware surface.
4. **#309 (DB + Clerk foundation) is done.** Shipped as PR #313; `requireAuth()` enforces `publicMetadata.role === 'leader'`; Clerk is in Open mode (self-registration on); `runs`/`runner_follows`/`schedule.run_id` are in `migrate.sql`. (Residual check before build: confirm `runner_follows` exists in the production Neon branch — it is the one table no code has exercised yet.)

---

## The keystone decision: superset, not two apps

**A leader is also a runner.** There is one app with one navigation. My Week is home for every signed-in user. "Leader" is an extra capability layered onto the *one run a user leads* — it unlocks Plan and schedule editing for that run and nothing else. A leader follows, rates, and browses other runs exactly as any runner does; the run they lead is auto-present on their own My Week.

This collapses the most complexity: one nav, one home, no parallel runner/leader experiences to maintain. Its cost — accepted — is that the leader's current home (`/` = the TigerWolves Schedule page) stops being home and becomes one per-run page reached from My Week.

---

## Entry routing — one rule

On load of `/`:

- **Logged out** → public All Runs (today's #303 marketing view).
- **Logged in, 0 follows** → All Runs (it *is* the first-login run picker — no separate onboarding screen).
- **Logged in, ≥1 follow** → My Week.

All Runs therefore does three jobs in one surface: public front door, first-login picker, and ongoing add-more directory. There is no separate `/onboarding` route (the 2026-09-07 spec had one; it is removed).

---

## UI reference

Approved screens are committed alongside this spec: [`2026-09-12-runner-experience-ui/runner-experience-screens.html`](2026-09-12-runner-experience-ui/runner-experience-screens.html) (open in a browser at 390px). It holds My Week, the per-run page (leader view), and All Runs (logged-in). These are fidelity mockups of layout and content shape — match the app's existing Tailwind card/pill/`ReactionPicker` components when building. The #302 prototype (`app/runner/*`) remains the visual precedent for anything not shown here.

## Surfaces

### My Week (home)

A cross-run hub. Not a new card language — the **same card as today's `ScheduleCard`**, made cross-run.

- **Window:** rolling ~7 days forward plus a couple of past days. One feed, all followed runs, interleaved by date, grouped by day with an eyebrow label (TODAY / weekday / NEXT UP).
- **Date strip** across the top; navigating it moves the whole cross-run view forward/back a week.
- **Cards carry full workout specifics** (expandable): workout name, instructions/why, distance/system chips, type pill, "Led by", and the inline reaction. This was the point of feedback — My Week must not be a thin list of labels; it shows what each run actually is this week.
- **Rate in place:** the existing KV workout-reaction mechanic (`ReactionPicker`, #206/#132) lives on the card. No new data model — it flows into the same votes leaders already see.
- **Run name is a link** (`›` affordance) to that run's per-run page.
- **Kind-driven body** (see below).

### Per-run page (= today's Schedule page, run-scoped)

Today's `/` Schedule page *becomes* this. Route `/runs/[id]` (exact path a build detail).

- Minimal run identity header (emoji, name, day/time, one-line description) + "‹ My Week" back.
- The existing schedule-card list: `NEXT UP`, date, workout name, color-coded type pill, expandable Instructions / Coach Notes / chips, "Led by", reaction.
- **Owning leader** sees "Plan week →" per entry (the existing route to post generation — unchanged). **Runners and non-owning leaders** see the same page read-only (no "Plan week →").
- A **"Following ✓"** toggle in the header so a runner can leave the run from where they are.
- **No** standalone "Generate post" button and **no** inline add/edit/delete controls — post generation and planning happen through the existing "Plan week →" → Plan flow, exactly as today. Editing lives here (via Plan week), never duplicated onto the My Week card.

### All Runs (real, auth-aware)

A **merge**, not a replacement, of two data sources, deduped:

- **On the platform** (DB `runs` table): TigerWolves + seeded partner runs. Real schedule data. Joinable → appear on My Week.
- **More NBR runs** (hardcoded `NBR_RUNS`): the rest of the club's ~20 runs. Listed for credibility/discovery, rendered muted as "Not on the app yet," **not** joinable. (Dedup: `NBR_RUNS` already contains "Tuesday Morning Tigerwolves," which must collapse into the real TigerWolves DB run, not appear twice.)

Logged-in adds a **Following** tier at top with a filled "Joined ✓" pill (tap → Leave) and "+ Join" on available platform runs. **Only platform runs are joinable**, guaranteeing My Week never shows a dead run. Keeps #303's time-of-day / category filter chips. Join/leave are Server Actions writing `runner_follows` (+ `updateTag('tigerwolves-data')` per the cache guardrail). The public (logged-out) view stays today's marketing directory.

---

## Card shape by `kind` (read-side mirror of #322)

Same card frame, body keyed off the run's `kind`:

- **Workout kind** → workout name, type pill, instructions/intervals, system/distance chips.
- **Easy / route kind** → route name, distance, "View route ↗" map link; no intervals.

Applies on both My Week cards and the per-run page.

## Component reuse & expanded-detail fidelity

The mockups abbreviate the expanded card for readability. They are **not** a proposal to reduce content. The expanded view keeps everything the current Schedule card shows today: Instructions, Distance/Time, Reason, Energy System, HR Zone, RPE, Turnaround, Variations, the flag button, and the reaction.

- **R1 (per-run page) reuses `ScheduleCard` + `WorkoutDetails` verbatim.** Expanded content is identical to today's Schedule page — nothing to re-specify; the build reads the existing components. The page-level change is scoping to a `run_id` and opening the read path (hiding "Plan week →" for non-owning users).
- **R3 (My Week) is the only new card.** Its expanded panel **renders the same `WorkoutDetails` component**, so a Workout-kind run is field-for-field identical to the per-run page. The Easy/route kind swaps in route fields (route description + map link) in place of interval detail. New elements on this card vs. today: run name + link, cross-run grouping, and collapsed-by-default.
- **Collapsed state (both surfaces):** matches today — date, workout name, type pill, "Led by", reaction (count pill or the dashed "React" ghost), and "Plan week →" for the owning leader. Never a bare label.
- **Default expand:** next/today entry expanded as a hero; all others collapsed; tap toggles.

The rule of thumb: get *structure and the new elements* right in this design; let *expanded detail* come from the existing components so the code matches today by construction.

---

## Navigation

Unified nav for signed-in users: **My Week · Plan *(leader-only)* · All Runs · Library · Races · Roadmap.** The standalone **Schedule tab retires** (its page becomes the per-run page). `RunnerNav` (prototype) and the leader `BottomNav` converge into this one nav. Runner routes are gated so runners cannot reach Plan, Library add/edit/delete, schedule management, or run config.

---

## Data model

Everything needed exists (from #309 + the leader stories):

- `runs` (id, name, emoji, description, day_of_week, meeting_time, meeting_location, …, `kind`, `workout_types`, `run_group_id`)
- `runner_follows` (clerk_user_id, run_id, joined_at) — follow join table
- `schedule.run_id` — PK `(date, run_id)`, runs independent
- workout model: `workout_families` / `workout_variants` / `run_groups`

**New read work:** a cross-run query joining `runner_follows` → `runs` → `schedule` → workout variant, for My Week. Cache it (existing `unstable_cache` / tag pattern). **New write work:** join/leave Server Actions on `runner_follows`.

---

## Story breakdown (R1–R4)

Dependency-ordered; each independently PR-able and sized to build comfortably under a 200K context window.

**R1 — Per-run page refactor.** `/` Schedule page → run-scoped per-run page. Opens read path to runners / non-owning leaders (read-only); owning leader keeps "Plan week →." Kind-aware body. Adds "Following ✓" toggle. *Foundational; leader-side `run_id` scoping already leans this way.*

**R2 — All Runs, real & personalized.** Merge DB `runs` + hardcoded `NBR_RUNS`, deduped; auth-aware Following tier; join/leave Server Actions → `runner_follows` (+ `updateTag`). Converge `/all-runs` and `/runner/all-runs`. *Also the first-login picker.*

**R3 — My Week.** Cross-run schedule query over followed runs; rolling 7-day + couple past; date-strip week nav; kind-driven cards with full specifics + rate-in-place; run-name links to R1. *The home; consumes R2's follows + R1's page.*

**R4 — Routing, nav unification & gating.** Superset nav; the `/` routing rule; retire Schedule tab; protect runner routes. *Integration layer that flips home to My Week.*

---

## Preconditions & sequencing

- **#309 done** (PR #313). Residual: confirm `runner_follows` live in production Neon before R2.
- **Build deferred** until the remaining leader-experience stories (#319 cycle engine, #322 in UAT, #323 cycle UI) complete.
- Each R-story follows the normal grooming → ready-to-build gate; this doc is the design basis, not a build authorization.

---

## Out of scope

- Runner comments (#267–#270), attendee/"Going" count, banner/photo upload, run leader pitch tour (#115), runner race goals (#116), reactions write-back beyond the existing mechanic, self-serve run creation.
- **Reconciling the old overlapping stories** (#305, #108–#114, #87, epics #102/#103) — the cleanup pass the #320 note anticipates. Tracked separately; not part of this design.

---

## Design decisions (the why)

- **Superset over two apps** — matches how NBR members actually behave (a runner who happens to lead one run); one nav, one home, role adds powers. Biggest complexity reducer in the design.
- **All Runs = picker, no separate onboarding screen** — the surface a runner needs on day one is the same one they need forever; a dedicated `/onboarding` route is waste.
- **Per-run page = today's Schedule page** — don't invent a new leader surface; open the read path on the one that exists. Editing stays in one place (Plan week), never duplicated.
- **Only platform runs joinable** — keeps the directory looking complete for the Sep-12 audience while guaranteeing My Week never shows a dead run.
- **Reuse the existing reaction mechanic for rating** — no new engagement data model; runner rating and leader "popular workouts" read the same KV votes.
- **Card shape by kind on the read side** — the runner-facing mirror of #322; one frame, kind-driven body.
