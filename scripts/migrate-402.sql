-- Story #402: Per-run last-run recency, stored on the run_workouts junction.
-- Run against the PR's Preview branch first, then production after the PR merges.
-- All statements are IF NOT EXISTS / idempotent recompute — safe to replay.
--
-- Depends on #404's run_workouts junction (run_id, family_id). Recency is a property
-- of the (run, workout) PAIR — a shared route's last-run differs by run — so it lives
-- on the junction, one nullable date per (run, family), NOT a single column on the
-- workout. See the story: keyed by FAMILY (the route), not variant (Flag L resolved).

-- 1. The recency column. Nullable: NULL = "Never" (the run has no matching past
--    schedule entry). One date per (run_id, family_id) membership row.
ALTER TABLE run_workouts ADD COLUMN IF NOT EXISTS last_ran DATE;

-- 2. Backfill from each run's own schedule history. The app already records when a
--    run ran a workout: schedule(date, run_id, workout_name) is retained (no pruning),
--    so TigerWolves recency derives from history with no manual import. For each run,
--    last_ran = MAX(schedule.date) over past/today entries whose workout_name matches a
--    route IN THAT RUN'S LIBRARY (a run_workouts membership row). Matching against the
--    run's own membership — not workout_families globally — is what keeps this per-run:
--    the name+run pair resolves to the family that run actually owns/adopted, and a run
--    is never credited with another run's schedule. Full recompute, so replay is
--    idempotent (re-derives the same MAX). Only UPDATEs existing membership rows — a
--    borrowed route (#405, scheduled but never adopted, no membership row) is correctly
--    left with no recency.
UPDATE run_workouts rw
SET last_ran = sub.max_date
FROM (
  SELECT m.run_id, m.family_id, MAX(s.date) AS max_date
  FROM run_workouts m
  JOIN workout_families wf ON wf.id = m.family_id
  JOIN schedule s ON s.run_id = m.run_id
                 AND s.workout_name = wf.name
                 AND s.workout_name IS NOT NULL
                 AND s.workout_name <> ''
                 AND s.date <= CURRENT_DATE
  GROUP BY m.run_id, m.family_id
) sub
WHERE rw.run_id = sub.run_id AND rw.family_id = sub.family_id;
