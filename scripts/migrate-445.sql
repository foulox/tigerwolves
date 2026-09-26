-- Story #445: normalize the flagship run to its NBR-directory identity.
--   name 'TigerWolves'  -> 'Tuesday Morning Tigerwolves'
--   id   'tigerwolves'  -> 'tuesday-morning-tigerwolves'  (= slugify(name))
-- Idempotent/replay-safe. Applies AFTER base migrate.sql (which still builds the
-- 'tigerwolves' row on a fresh DB); this file (445) is numbered above all current
-- migrations. On replay the base seed no longer re-creates a stray 'tigerwolves'
-- (its guard now also skips the renamed id — see migrate.sql #445 note), so every
-- WHERE id='tigerwolves' statement below simply no-ops once the rename has happened.

-- 1. Give the three run_id FKs ON UPDATE CASCADE so the PK rename repoints children.
ALTER TABLE schedule       DROP CONSTRAINT IF EXISTS schedule_run_id_fk;
ALTER TABLE schedule       ADD  CONSTRAINT schedule_run_id_fk        FOREIGN KEY (run_id) REFERENCES runs(id) ON UPDATE CASCADE;
ALTER TABLE runner_follows DROP CONSTRAINT IF EXISTS runner_follows_run_id_fkey;
ALTER TABLE runner_follows ADD  CONSTRAINT runner_follows_run_id_fkey FOREIGN KEY (run_id) REFERENCES runs(id) ON UPDATE CASCADE;
ALTER TABLE run_workouts   DROP CONSTRAINT IF EXISTS run_workouts_run_id_fkey;
ALTER TABLE run_workouts   ADD  CONSTRAINT run_workouts_run_id_fkey  FOREIGN KEY (run_id) REFERENCES runs(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- 2. run_leaders has NO FK — repoint it explicitly (no-op once renamed).
UPDATE run_leaders SET run_id = 'tuesday-morning-tigerwolves' WHERE run_id = 'tigerwolves';

-- 3. Rename the PK + the display name. The three FKs cascade the id to their children.
UPDATE runs SET id = 'tuesday-morning-tigerwolves', name = 'Tuesday Morning Tigerwolves' WHERE id = 'tigerwolves';

-- 4. Repoint the schedule default off the old id (legacy backfill artifact).
ALTER TABLE schedule ALTER COLUMN run_id SET DEFAULT 'tuesday-morning-tigerwolves';
