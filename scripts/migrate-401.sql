-- Story #401 (Story A): per-run workout libraries — backfill ownership.
-- Run against the PR's Preview branch first, then production after the PR merges.
-- All statements are IF NOT EXISTS / idempotent — safe to replay.
--
-- Why: #401 reactivates run_group_id as the library's visibility scope (a run's
-- "Your run" view shows only workouts its group owns). Before this, #347 made
-- run_group_id ownership-only and the Add/Edit picker was removed, so workouts
-- created after #347 have run_group_id = NULL. Reactivating scoping without this
-- backfill would empty the TigerWolves library (every NULL-owned family would drop
-- out of "Your run"). This assigns every NULL-owned family to the TigerWolves group.
--
-- Fixtures (MMER, Mourning Doves) already carry their own non-NULL run_group_id, so
-- `WHERE run_group_id IS NULL` excludes them automatically — they are never reassigned.

-- 1. Defensive: ensure the TigerWolves run_group exists (seeded in #274's migration).
INSERT INTO run_groups (name, venue, default_location)
SELECT 'TigerWolves', 'road', 'Tom Stofka Garden, aka "Da Bins"'
WHERE NOT EXISTS (SELECT 1 FROM run_groups WHERE name = 'TigerWolves');

-- 2. Index the ownership FK — the scoped read (fetchWorkoutVariants WHERE
--    wf.run_group_id = $1) and "Your run"/picker filters all key off it.
CREATE INDEX IF NOT EXISTS workout_families_run_group_id_idx
  ON workout_families (run_group_id);

-- 3. Backfill: every NULL-owned family → the TigerWolves group. Non-NULL owners
--    (MMER / Mourning Doves fixtures, and any run reconciled via createRun) are
--    left untouched. Idempotent: a replay matches zero rows once run.
UPDATE workout_families
SET run_group_id = (SELECT id FROM run_groups WHERE name = 'TigerWolves')
WHERE run_group_id IS NULL;
