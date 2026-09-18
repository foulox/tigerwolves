-- Story #404: Adopt routes into your run's library (shared collaborative catalog).
-- Run against the PR's Preview branch first, then production after the PR merges.
-- All statements are IF NOT EXISTS / idempotent / ON CONFLICT — safe to replay.
--
-- Why: #401 made a run's "Your run" library = the routes its run_group OWNS
-- (workout_families.run_group_id). This story replaces that single-source check with
-- a membership junction (run_workouts) so a run's library = routes it created OR
-- adopted from another run. run_group_id is demoted to creator credit only.
--
-- The seed below makes membership uniform: every route a run already owns becomes a
-- membership row, so "Your run" is one check (run_workouts) covering both created and
-- adopted routes. Without it, reactivating the membership predicate would empty every
-- run's library (no rows yet). Adoption then just adds more rows.

-- 1. The membership junction. PK (run_id, family_id) makes adopt idempotent; both FKs
--    CASCADE so a global route delete (or run delete) drops the stale memberships.
CREATE TABLE IF NOT EXISTS run_workouts (
  run_id     TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  family_id  INT  NOT NULL REFERENCES workout_families(id) ON DELETE CASCADE,
  PRIMARY KEY (run_id, family_id)
);

-- 2. Index the read key — the "Your run" library fetch (all family_ids for a run).
CREATE INDEX IF NOT EXISTS run_workouts_run_id_idx ON run_workouts (run_id);

-- 3. Seed creator membership: every run gets a membership row for each family its
--    run_group OWNS, so "Your run" stays exactly what #401 showed (its created routes)
--    the instant this predicate goes live. A run with NULL run_group_id owns nothing
--    to seed here (the JOIN drops NULLs) — it falls back to the full catalog in the UI,
--    same as #401. Idempotent: ON CONFLICT skips rows a replay would duplicate.
INSERT INTO run_workouts (run_id, family_id)
SELECT r.id, wf.id
FROM workout_families wf
JOIN runs r ON r.run_group_id = wf.run_group_id
ON CONFLICT (run_id, family_id) DO NOTHING;
