# Story 310 — Leader Experience Design Spec
**Date:** 2026-09-08
**Status:** Approved for implementation planning
**Depends on:** #309 (merged 2026-09-08)

---

## What this story ships

A partner NBR run leader can sign in, see their run's schedule, pick a workout, and generate a correct Heylo post — with no TigerWolves content bleeding through. It also ships the Run Settings UI (post template + roster management), a rotation-aware leader assignment system with away period support, and a single verification gate before copying the post.

This is the leader half of the multi-run trial. Story 3 (#311) is the runner half.

---

## Scope

### In scope
- Plan page: per-run detection, run config passed to `buildPost`, leader picker, verification checkbox
- Heylo post: fully parameterized from `runs` table — no hardcoded TigerWolves strings
- TigerWolves regression: byte-for-byte identical post output
- Library: per-run default view, cross-run browse toggle
- Schedule: filtered to leader's run by default
- Run Settings UI: Post template tab + Roster tab (hamburger menu, leader-only)
- Rotation system: `rotation_order` on `run_leaders`, auto-assigns leader on new schedule entries
- Away periods: per-leader date ranges, retroactive reassignment of existing entries on save, confirmation banner
- Auto-generation: rolling 12-week schedule horizon, generated on page load, idempotent
- KV reactions: read-only, surfaced in Plan and Library (no migration, per #241)

### Out of scope
- Runner-facing surfaces (My Week, All Runs, per-run pages) — Story 3
- Self-serve run creation
- Schedule tab in Run Settings (auto-generation is invisible — no UI needed)
- Reactions migration from KV to Neon (deferred to #267)

---

## Data model additions

Building on the schema shipped in #309.

### `runs` — one new column
```sql
ALTER TABLE runs ADD COLUMN leader_intro TEXT;
```

`leader_intro` — the text that precedes the comma-separated leader roster in the Heylo post, e.g. `"Your TigerWolves leaders:"`. Backfill TigerWolves row at migration time. The `warmup_description` column from #309 is retained but not exposed in the Run Settings UI — it exists for potential future use or workout-level override logic.

### `run_leaders` — two new columns
```sql
ALTER TABLE run_leaders
  ADD COLUMN rotation_order INT,
  ADD COLUMN away_periods   JSONB NOT NULL DEFAULT '[]';
```

`rotation_order` — integer, 1-based, determines cycle order within a run. Null means the leader exists in the roster but has no assigned rotation slot (shows at the bottom in Run Settings, no auto-assignment).

`away_periods` — array of `{ from: "YYYY-MM-DD", to: "YYYY-MM-DD" }` objects. Past periods are kept (audit trail) but ignored by all logic. Only future periods affect rotation and auto-generation.

### `schedule` — one new column
```sql
ALTER TABLE schedule ADD COLUMN needs_leader BOOLEAN;
```

`needs_leader` — set to `true` only when `generateScheduleHorizon()` cannot find any non-away leader for a date. Null (default) means the entry has a valid assigned leader. Used to surface the "assign manually" warning on the Plan and Schedule pages.

---

## Run Settings UI

### Visual reference — read before implementing any UI surface

Mockup: `scratch/run-config-final.html` — open this in a browser before writing any component for Run Settings, the Roster tab, or the Schedule leader picker. It shows:
- Post template tab (field order, spacing, Save button placement)
- Roster tab default state (rotation number → up/down arrows → avatar → name + badges → email → Away button → remove button, left to right)
- Roster tab with away panel open (inline expansion, From/To date inputs, Save/Cancel)
- Roster tab after saving (green confirmation banner, away badge on row, stacked existing periods with Remove, "+ Add period")
- Schedule page with tappable "Led by" and ↩ reassigned badge
- Leader picker (roster rows with avatar, name, Away badge, checkmark on selected)

The text spec below captures logic and field definitions. The mockup is the authority on layout and visual hierarchy.

### Access
Hamburger menu → "Run Settings" entry. Conditionally rendered: only visible when `isLeader` is true. Opens `/run-config` (new route).

### Structure
Two tabs: **Post template** | **Roster**

The Schedule tab is not needed — auto-generation is silent.

---

### Post template tab

Four fields, one Save button. All fields pre-populated from the leader's run's `runs` row.

| Field | DB column | Notes |
|---|---|---|
| Post header | `post_header` | Textarea — opening block of post including run name, emoji |
| Meeting location | `meeting_location` | Short text |
| Leader intro | `leader_intro` | Short text — e.g. "Your TigerWolves leaders:" — system appends comma-separated names (new column, added in this story) |
| Closing notes | `closing_notes` | Textarea — bag drop, logistics |

Save writes all four fields back to `runs` via a server action and calls `updateTag('tigerwolves-data')`.

Warm-up is **not** editable here — it is set per workout via `warmup_override` on the workout, not per run.

---

### Roster tab

#### Current leaders section

Each row shows, left to right:
- Rotation order number (e.g. "1", "2" — blank if unassigned)
- Up/down reorder arrows — tap to shift one position; numbers update immediately; change persists on arrow tap (no separate Save)
- Avatar (initials)
- Name + "you" badge if current user + away badge (see below)
- Email (secondary line)
- "Away" button — opens inline away panel for this row
- Remove button (×)

**Away badge on row:** shows the next upcoming away period only.
- One future period: `"Away Dec 23–Jan 4"`
- Multiple future periods: `"Away Dec 23–Jan 4 (+1 more)"`
- No future periods: no badge shown

#### Away panel (inline, expands below the row)

Opened by tapping the "Away" button. Shows:

1. **Existing periods** — each as a removable row: `"Dec 23 – Jan 4, 2026  [Remove]"`
2. **Add period** — two date inputs (From / To) + "Save away period" button + Cancel

On save:
- Stores the period in `away_periods` JSONB
- Scans existing `schedule` entries within the date range where `leader = this leader's name`
- Finds the next non-away leader in rotation for each affected date and updates the `leader` field
- **Edge case:** if all leaders in the run are away for a given date, the entry is left as-is and flagged — a warning appears in the confirmation: `"Jan 6 has no available leader — please assign manually"`
- Shows a confirmation banner: `"Away period saved · 3 schedule entries reassigned to Kelsey"` (or the edge-case warning)

Multiple future periods are displayed as a stacked list in the panel. Past periods are not shown.

#### Add leader section

Email input + "Add to roster" button. Looks up the Clerk user by email, adds a `run_leaders` row with `rotation_order` set to the current max + 1 (appended to bottom of rotation).

---

## Rotation and auto-generation

### Rotation logic

The rotation cycles through `run_leaders` ordered by `rotation_order ASC`, wrapping back to 1 after the last slot. A leader is skipped for a given date if any of their `away_periods` covers that date.

### Auto-generation (rolling 12-week horizon)

Runs on Schedule and Plan page load (server-side, in `page.tsx`). Idempotent — safe to call on every load.

1. Find the last existing `schedule` entry for this run
2. Find that entry's assigned leader; determine their position in rotation
3. Generate weekly entries (using `runs.day_of_week`) from the day after the last entry through 12 weeks from today, if any dates are missing
4. For each new date: advance one position in rotation, skip anyone whose `away_periods` covers that date, assign the next available leader
5. If all leaders are away for a generated date: create the entry with `leader = null` and a `needs_leader` flag (new boolean column on `schedule`, nullable, default null — only set true when auto-generation can't resolve)

### Leader override (Plan page)

The current week's leader is shown on the Plan page. For leaders, it is tappable: opens an inline picker listing all leaders in rotation order, with "Away" badge on anyone with an active away period for that date. Selecting a name updates the `schedule` entry's `leader` field immediately.

Entries that were auto-reassigned due to an away period show a subtle "↩ reassigned" indicator next to the leader name on the Plan page and Schedule page (read-only on Schedule).

The Schedule page remains **read-only** — no editing, only display. The ↩ badge is informational.

---

## Plan page changes

### Per-run detection

`app/plan/page.tsx` calls a new `getLeaderRun(userId)` query that joins `run_leaders → runs` on `clerk_user_id`. Returns the full run config struct. If no match (leader not in any `run_leaders` row): falls back to the TigerWolves run config — handles the edge case of a Clerk user with `role=leader` who hasn't been added to a run's roster yet.

### Post generation

`buildPost` already accepts a run config struct (shipped in #309). Plan page passes the leader's run config. No hardcoded TigerWolves strings remain in `buildPost`.

### Verification checkbox

Between "Set as plan" and "Copy to clipboard", a checkbox must be checked before the Copy button appears. The checkbox resets every time a new post is generated.

**Checkbox label is dynamically constructed from the workout data:**
- Quality / interval run: `"I've verified: [intervals] @ [pace], [rest] rest, ~[distance]"` — e.g. *"I've verified: 3×1K @ 3K pace, 90s standing rest, ~5mi"*
- Route run: `"I've verified: [route name], ~[distance], meeting at [location]"` — e.g. *"I've verified: Kent Ave loop, ~6mi, meeting at Tom Stofka Garden"*
- Tempo / progression (no explicit intervals): `"I've verified: [workout name], ~[distance], [key detail]"`

The label is constructed from the workout fields already available when the post is built — no new data fetching required. Falls back to `"I've verified the key workout details"` if the workout type can't be determined.

Copy button is disabled (greyed out) until the checkbox is checked. Checking it enables Copy immediately — no page reload.

### KV reactions in Plan

Plan page passes `voteData` to `PlanClient` (already done for TigerWolves). No change to the KV query — the `run_id` scoping for KV is deferred (#241). Read-only.

---

## Library changes

### Per-run default view

`LibraryClient` receives the leader's `run_id`. Default filter: show only workouts where `run_group_id` matches the leader's run. The existing "all runs" / no-filter state becomes the cross-run browse mode.

### Cross-run browse toggle

A toggle control at the top of the library: "Your run" | "All runs". Switching to "All runs" removes the `run_id` filter — existing query already returns everything when no run filter is applied. Toggle state is not persisted (defaults to "Your run" on each visit).

---

## Schedule changes

### Per-run filtering

`fetchSchedule` adds an optional `run_id` parameter. When called from the Schedule page server component with the leader's `run_id`, it filters to that run's entries only. The existing TigerWolves Schedule page call passes `run_id = 'tigerwolves'` explicitly (no behavior change for TigerWolves leaders today).

The Schedule page header subtitle changes from "Upcoming Tuesdays" to "Upcoming [run.day_of_week]s" using the run's `day_of_week` field.

---

## TigerWolves regression requirement

`buildPost` must produce byte-for-byte identical output for TigerWolves after this story. The `RUN_LEADERS` hardcoded array in `lib/data.ts` is replaced by a DB query returning `run_leaders` for `run_id = 'tigerwolves'`, ordered by `rotation_order`. The seed data must produce exactly the same names in the same order as the current hardcoded array.

A unit test (`__tests__/postBuilder.test.ts`) verifies this: given a fixture TigerWolves run config and a known schedule entry, `buildPost` output must match a stored snapshot of the current post format.

---

## Edge cases

| Scenario | Behavior |
|---|---|
| All leaders away for a date | Entry created with `needs_leader = true`; warning shown in away-save confirmation; leader must assign manually via Plan page picker |
| Leader has no `run_leaders` row | Falls back to TigerWolves run config; no crash |
| Away period overlaps zero existing entries | Silent — confirmation banner shows "0 entries reassigned" |
| Leader removed from roster mid-rotation | Their existing schedule entries are not auto-updated — manual reassignment needed; they remain as assigned until changed |
| `rotation_order` null | Leader shown at bottom of roster, not included in auto-generation or auto-reassignment |

---

## New files

| File | Purpose |
|---|---|
| `app/run-config/page.tsx` | Run Settings server component — fetches run config + roster for signed-in leader |
| `app/run-config/actions.ts` | Server actions: save post template, save rotation order, save away period (triggers retroactive reassignment), add/remove leader |
| `components/RunConfigClient.tsx` | Two-tab Run Settings UI (Post template + Roster) |
| `components/RosterTab.tsx` | Roster tab with rotation order, away panel, add leader |
| `components/LeaderPicker.tsx` | Inline leader picker used by Plan page |

---

## Modified files

| File | Change |
|---|---|
| `lib/db.ts` | `getLeaderRun()`, `fetchSchedule(run_id)`, `fetchWorkoutVariants(run_id)`, `generateScheduleHorizon()`, `saveAwayPeriod()` (with reassignment scan), `saveRotationOrder()`, `savePostTemplate()` |
| `lib/data.ts` | Remove `RUN_LEADERS` hardcoded array |
| `lib/postBuilder.ts` | Already parameterized — verify no hardcoded strings remain |
| `app/plan/page.tsx` | Call `getLeaderRun()`, pass run config + leader roster to PlanClient; call `generateScheduleHorizon()` |
| `app/page.tsx` | Pass `run_id` to `fetchSchedule`; call `generateScheduleHorizon()` |
| `components/PlanClient.tsx` | Leader picker (tappable leader field), verification checkbox (dynamic label, gates Copy) |
| `components/LibraryClient.tsx` | Per-run default + cross-run browse toggle |
| `components/Header.tsx` | "Run Settings" entry in hamburger menu, conditional on `isLeader`; links to `/run-config` |

---

## Testing

### Unit tests (`__tests__/`)

| Test file | What it verifies |
|---|---|
| `postBuilder.test.ts` | TigerWolves regression — output byte-for-byte matches snapshot given fixture run config; Mourning Doves config produces correct branding (different header, location, leader intro, roster) |
| `db.test.ts` | `generateScheduleHorizon()` is idempotent (double-call produces no duplicates); `saveAwayPeriod()` correctly reassigns affected entries; all-leaders-away sets `needs_leader = true` |
| `rotationLogic.test.ts` (new) | Rotation wraps correctly; away leaders skipped; multiple away leaders skipped in sequence |

### E2E tests (`e2e/`)

| Spec | What it verifies |
|---|---|
| `plan.spec.ts` (extend) | TigerWolves leader: post generates with correct branding; Copy button disabled until checkbox checked; checking checkbox enables Copy |
| `run-config.spec.ts` (new) | Post template save persists; leader added to roster appears; away period saved triggers reassignment; confirmation banner shows correct count |

Run command: `npm run test:unit` for unit, `npm run test:e2e` for e2e.

---

## Performance

One additional DB join per Plan and Schedule page load (`run_leaders → runs` on `clerk_user_id`). Sits inside the existing `unstable_cache` call — no new network round-trips in the hot path.

`generateScheduleHorizon()` is a write operation — must run outside the cache. It is idempotent and fast (checks last entry date first; no-ops if horizon is already met). Acceptable on page load for leaders; runners never trigger it.
