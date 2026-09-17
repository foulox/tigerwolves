-- Story #385: link run leaders by email, not name.
-- Run against the PR's Preview branch first, then production after PR merges.
-- All statements are IF EXISTS / IF NOT EXISTS — safe to replay.
--
-- Why: name is not a stable identity across environments. Preview/demo run on a
-- different Clerk instance than production, so a forked prod leader row's
-- clerk_user_id never matches, and name-based dedup produces "Lou" + "Lou Fox"
-- duplicates. Email is stable across instances, so it becomes the link/dedup key.
-- Requires scripts/backfill-leader-emails.ts to have populated run_leaders.email
-- (from each row's linked Clerk account) before the new unique index does any work.

-- 1. Defensive: email column already exists since #310, but keep this idempotent
--    so the migration can run against a branch that somehow missed that migration.
ALTER TABLE run_leaders ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Drop the old name-based unique constraint. This is what six ON CONFLICT
--    (run_id, name) sites currently rely on; all move to the email key in the
--    same story. Dropping it also unblocks two leaders sharing a first name later.
ALTER TABLE run_leaders DROP CONSTRAINT IF EXISTS run_leaders_run_id_name_key;

-- 3. Add the email-based unique index. Partial (WHERE email IS NOT NULL) so legacy
--    or in-flight rows without an email don't collide on a shared NULL.
CREATE UNIQUE INDEX IF NOT EXISTS run_leaders_run_id_email_key
  ON run_leaders (run_id, email) WHERE email IS NOT NULL;
