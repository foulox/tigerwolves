-- Migration: initial schema
-- Run against production and staging (Neon preview branch) before #84 seed

-- The original `CREATE TABLE IF NOT EXISTS workouts (...)` DDL that lived here
-- (#84-#209 era), plus the #209 `ALTER TABLE workouts ADD COLUMN ... flagged`/
-- `flag_note` statements that used to follow the `races` block below, are
-- removed as of #278: `workouts` was renamed to `workouts_legacy` further down
-- this file, so every one of those statements would be a permanent no-op on
-- any database from here on (a fresh database never has `workouts` to create
-- or alter; an existing one gets it renamed away by the next statement in the
-- same replay). Leaving the CREATE in place would have silently resurrected
-- an empty ghost `workouts` table on every future full-file replay of this
-- script (run-migrate.ts has no migration-tracking table — it always runs the
-- whole file); the two ALTERs would just be dead weight parsed on every replay
-- forever. See `workouts_legacy` below for the live (frozen, renamed) table.

CREATE TABLE IF NOT EXISTS schedule (
  date DATE PRIMARY KEY,
  workout_type TEXT NOT NULL DEFAULT '',
  leader TEXT NOT NULL DEFAULT '',
  workout_name TEXT,
  selected_variations TEXT[] NOT NULL DEFAULT '{""}'
);

-- #201: add selected_variations to existing schedule tables
ALTER TABLE schedule ADD COLUMN IF NOT EXISTS selected_variations TEXT[] NOT NULL DEFAULT '{""}';

CREATE TABLE IF NOT EXISTS races (
  date DATE NOT NULL,
  name TEXT NOT NULL,
  distance TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (date, name)
);

-- #238: runner-added races need a real id — the existing (date, name) composite key
-- breaks once runners can submit near-duplicate entries. Also adds organizer/verification/
-- flag state for community-submitted races. verified defaults true so existing
-- leader-seeded rows backfill as already-verified; new runner submissions explicitly
-- insert verified=false.
ALTER TABLE races ADD COLUMN IF NOT EXISTS id SERIAL;
ALTER TABLE races ADD COLUMN IF NOT EXISTS organizer TEXT NOT NULL DEFAULT '';
ALTER TABLE races ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE races ADD COLUMN IF NOT EXISTS flagged BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE races ADD COLUMN IF NOT EXISTS flag_note TEXT NOT NULL DEFAULT '';
ALTER TABLE races DROP CONSTRAINT IF EXISTS races_pkey;
ALTER TABLE races ADD PRIMARY KEY (id);

CREATE TABLE IF NOT EXISTS run_leaders (
  id SERIAL PRIMARY KEY,
  run_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INT,
  active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (run_id, name)
);

-- #272: new data model — run_groups / workout_families / workout_variants / routes
-- Additive alongside the existing workouts table; no application code changes in this story.
-- workout_families and routes both reference run_groups, so run_groups must be created first.
-- workout_variants references workout_families, so workout_families precedes it.
CREATE TABLE IF NOT EXISTS run_groups (
  id               SERIAL PRIMARY KEY,
  name             TEXT NOT NULL UNIQUE,
  venue            TEXT NOT NULL,   -- 'road' | 'track' | 'trail'
  default_location TEXT
);

CREATE TABLE IF NOT EXISTS workout_families (
  id             SERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  category       TEXT NOT NULL,     -- Quality, Long, Easy
  type           TEXT NOT NULL,     -- Threshold, Ladder, Superset, etc. (TEXT in DB; zod enum on write path)
  reason         TEXT,
  author         TEXT,
  coaching_notes TEXT,
  map_link       TEXT,
  run_group_id   INT REFERENCES run_groups(id)  -- NULL = global/inspirational; one group per family for now
);

CREATE TABLE IF NOT EXISTS workout_variants (
  id              SERIAL PRIMARY KEY,
  family_id       INT NOT NULL REFERENCES workout_families(id),
  label           TEXT,             -- NULL = sole/standard variant; "Shorter"/"Longer"/etc. when multiple exist
  sort_order      INT,              -- display ordering within family; NULL for singletons
  raw_input       TEXT NOT NULL,    -- leader's original free-form description, kept verbatim for audit
  has_turnaround  BOOLEAN NOT NULL DEFAULT false,
  turnaround      TEXT,             -- e.g. "After the 2nd 5-min tempo rep"; populated by AI at creation
  energy_system   TEXT,
  hr_zone         TEXT,
  rpe             TEXT,
  dist_time       TEXT,
  race_types      TEXT[] NOT NULL DEFAULT '{}',
  training_phases TEXT[] NOT NULL DEFAULT '{}',
  flagged         BOOLEAN NOT NULL DEFAULT false,
  flag_note       TEXT NOT NULL DEFAULT ''
);
-- Two partial indexes rather than a single UNIQUE constraint: PostgreSQL treats NULLs as distinct
-- in UNIQUE constraints, so (family_id, label) UNIQUE would allow multiple singleton rows per family.
CREATE UNIQUE INDEX IF NOT EXISTS workout_variants_family_label_key
  ON workout_variants (family_id, label) WHERE label IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS workout_variants_family_singleton_key
  ON workout_variants (family_id) WHERE label IS NULL;

CREATE TABLE IF NOT EXISTS routes (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  distance     NUMERIC,            -- miles
  description  TEXT,               -- free text including any progression notes
  map_link     TEXT,
  run_group_id INT REFERENCES run_groups(id)  -- scoped to one group for now; sharing model deferred
);

-- #274: seed the TigerWolves run group so the new write path has a real group to
-- attach new workout_families to — run_groups had no seed data until now. venue/
-- default_location match the route described in buildPost (lib/postBuilder.ts).
INSERT INTO run_groups (name, venue, default_location)
SELECT 'TigerWolves', 'road', 'Tom Stofka Garden, aka "Da Bins"'
WHERE NOT EXISTS (SELECT 1 FROM run_groups WHERE name = 'TigerWolves');

-- #278: cutover complete (#274-#277 verified in production) — rename rather than
-- drop to keep a costless rollback net for the one unverified edge (read-path
-- variety across every workout/turnaround/venue combo). No code reads this table
-- after this migration; see lib/db.ts and lib/scheduleUtils.ts deletions in #278.
-- IF EXISTS keeps this idempotent — run-migrate.ts replays the whole file on
-- every run (no migration-tracking table), so a second run must not fail once
-- `workouts` is already gone.
ALTER TABLE IF EXISTS workouts RENAME TO workouts_legacy;

-- #309: multi-run foundation — runs table, runner_follows, and new columns for run identity
-- Lou runs this against Neon Production and Staging after the PR merges.
-- Post-migration steps (all done by Lou in external tools):
--   1. Disable Restricted mode on both the Production and Development Clerk instances.
--   2. Set publicMetadata.role = 'leader' for every TigerWolves leader in the Clerk dashboard.
--   3. Set role = 'leader' on the Playwright test-leader account (.env.test PLAYWRIGHT_TEST_EMAIL).
--   4. Backfill run_leaders.clerk_user_id for each active TigerWolves leader (see example below).

CREATE TABLE IF NOT EXISTS runs (
  id                  TEXT PRIMARY KEY,   -- slug: 'tigerwolves', 'mourning-doves'
  name                TEXT NOT NULL,
  emoji               TEXT,
  description         TEXT,
  day_of_week         TEXT,               -- 'Tuesday', 'Wednesday'
  meeting_time        TEXT,               -- '6:30 AM'
  meeting_location    TEXT,
  warmup_description  TEXT,               -- default warm-up block; overridable per workout via workout_families.warmup_override
  closing_notes       TEXT,               -- bag drop, logistics — static per run
  post_header         TEXT                -- full opening block of the Heylo post (before dynamic date/workout lines)
);

-- TigerWolves seed row — values extracted from lib/postBuilder.ts (the current hardcoded post).
-- Story 2 will replace hardcoded buildPost strings with a DB-driven buildPost(run, ...) call.
INSERT INTO runs (id, name, emoji, description, day_of_week, meeting_time, meeting_location, warmup_description, closing_notes, post_header)
SELECT
  'tigerwolves',
  'TigerWolves',
  '🐯🐺',
  'North Brooklyn Runners'' Tuesday morning quality workout run.',
  'Tuesday',
  '6:30 AM',
  'Tom Stofka Garden, aka "Da Bins"',
  $$📍 Starting point and route: Tom Stofka Garden, aka "Da Bins."
We'll warm up by jogging to Marsha P. Johnson which is at the corner of North 8th and Kent
The run will be along the Kent Avenue Speedway
We'll finish up back at Marsha P. Johnson State Park and cool down with a jog to the track$$,
  'Bag Drop: Sorry, Not available',
  $$🐯🐺 TigerWolves Tuesday Workout

👉 https://tigerwolves.foulox.me 👈
👀 See every workout between now and the NYC Marathon in the app
🗳️ React to let us know what you like — and what you don't$$
WHERE NOT EXISTS (SELECT 1 FROM runs WHERE id = 'tigerwolves');

CREATE TABLE IF NOT EXISTS runner_follows (
  clerk_user_id  TEXT NOT NULL,
  run_id         TEXT NOT NULL REFERENCES runs(id),
  joined_at      TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (clerk_user_id, run_id)
);

-- Add run_id to schedule. NOT NULL DEFAULT 'tigerwolves' backfills all existing rows immediately in Postgres.
ALTER TABLE schedule ADD COLUMN IF NOT EXISTS run_id TEXT NOT NULL DEFAULT 'tigerwolves';
ALTER TABLE schedule DROP CONSTRAINT IF EXISTS schedule_run_id_fk;
ALTER TABLE schedule ADD CONSTRAINT schedule_run_id_fk FOREIGN KEY (run_id) REFERENCES runs(id);

-- Add clerk_user_id to run_leaders — nullable; Lou backfills with actual Clerk user IDs after migration.
-- Example: UPDATE run_leaders SET clerk_user_id = 'user_abc123' WHERE name = 'Lou Fox' AND run_id = 'tigerwolves';
ALTER TABLE run_leaders ADD COLUMN IF NOT EXISTS clerk_user_id TEXT;

-- Add Story-2 forward-compat columns to workout_families.
-- warmup_override: per-workout override for the run's default warmup_description (null = use run default).
-- route_description / route_link: turn-by-turn text and map URL for non-quality (route) runs.
-- Note: run_group_id (existing INT FK) already handles workout-to-run scoping; no run_id column added here.
ALTER TABLE workout_families ADD COLUMN IF NOT EXISTS warmup_override TEXT;
ALTER TABLE workout_families ADD COLUMN IF NOT EXISTS route_description TEXT;
ALTER TABLE workout_families ADD COLUMN IF NOT EXISTS route_link TEXT;
