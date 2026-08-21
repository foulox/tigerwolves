-- Migration: initial schema
-- Run against production and staging (Neon preview branch) before #84 seed

-- The original `CREATE TABLE IF NOT EXISTS workouts (...)` DDL that lived here
-- (#84-#209 era) is removed as of #278: `workouts` was renamed to
-- `workouts_legacy` further down this file, and leaving an IF-NOT-EXISTS
-- CREATE for the old name in place would silently resurrect an empty ghost
-- `workouts` table on every future full-file replay of this script (run-migrate.ts
-- has no migration-tracking table — it always runs the whole file). See
-- `workouts_legacy` below for the live (frozen, renamed) table.

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

-- #209: visible flag + inline fix for workouts, mirroring #238/#256's races flag
-- state. Workouts are always leader-authored (addWorkout/updateWorkout require auth),
-- so unlike races there's no "unverified" state — just flagged / not.
-- IF EXISTS on the table (not just the column) keeps this safe to replay after
-- #278's rename below has already renamed `workouts` away on a given database.
ALTER TABLE IF EXISTS workouts ADD COLUMN IF NOT EXISTS flagged BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS workouts ADD COLUMN IF NOT EXISTS flag_note TEXT NOT NULL DEFAULT '';

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
  name             TEXT NOT NULL,
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
