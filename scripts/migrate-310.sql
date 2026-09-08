-- Story #310: leader experience additions
-- Run against Preview branch first, then production after PR merges.
-- All statements are IF NOT EXISTS / safe to replay.

-- 1. Add leader_intro to runs
ALTER TABLE runs ADD COLUMN IF NOT EXISTS leader_intro TEXT;

-- Backfill TigerWolves — must match current RUN_LEADERS join string exactly
UPDATE runs SET leader_intro = 'Run Leaders:' WHERE id = 'tigerwolves';

-- 2. Add away_periods to run_leaders
-- Note: run_leaders already has sort_order (used as rotation_order in this story)
ALTER TABLE run_leaders
  ADD COLUMN IF NOT EXISTS away_periods JSONB NOT NULL DEFAULT '[]';

-- 3. Add email to run_leaders (needed for Add Leader by email UI)
ALTER TABLE run_leaders ADD COLUMN IF NOT EXISTS email TEXT;

-- 4. Add needs_leader flag to schedule
ALTER TABLE schedule ADD COLUMN IF NOT EXISTS needs_leader BOOLEAN;

-- NOTE (post-review): Before relying on the post-generation regression snapshot in
-- tests, verify:
--   a) run_leaders seed rows exist for the target run (SELECT * FROM run_leaders WHERE run_id = 'tigerwolves')
--   b) runs.meeting_location and runs.post_header are non-null for that run
--      (SELECT id, meeting_location, post_header FROM runs WHERE id = 'tigerwolves')
-- Both columns were added in this migration; a Preview branch that missed step 1
-- or the UPDATE backfill above will produce empty-field posts that don't match the snapshot.

-- 5. Backfill rotation for TigerWolves (sort_order already set in #309 seed if done)
-- Only run if sort_order values are NULL:
-- UPDATE run_leaders SET sort_order = 1 WHERE run_id = 'tigerwolves' AND name = 'Luis';
-- UPDATE run_leaders SET sort_order = 2 WHERE run_id = 'tigerwolves' AND name = 'Lou';
-- UPDATE run_leaders SET sort_order = 3 WHERE run_id = 'tigerwolves' AND name = 'Kostas';
-- UPDATE run_leaders SET sort_order = 4 WHERE run_id = 'tigerwolves' AND name = 'Joelle';
-- UPDATE run_leaders SET sort_order = 5 WHERE run_id = 'tigerwolves' AND name = 'Kelsey';
-- UPDATE run_leaders SET sort_order = 6 WHERE run_id = 'tigerwolves' AND name = 'Obi';
-- UPDATE run_leaders SET sort_order = 7 WHERE run_id = 'tigerwolves' AND name = 'Jared';
