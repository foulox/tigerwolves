-- Story #360: All Runs renders real DB runs (dedup via directory link)
-- Run against Preview branch first, then production after PR merges.
-- All statements are IF NOT EXISTS / safe to replay.

ALTER TABLE runs ADD COLUMN IF NOT EXISTS nbr_directory_id TEXT;

-- Unique only when set (many runs may have no directory link).
CREATE UNIQUE INDEX IF NOT EXISTS runs_nbr_directory_id_key
  ON runs (nbr_directory_id) WHERE nbr_directory_id IS NOT NULL;

-- Backfill the two legacy links (was the hardcoded NBR_TO_DB_RUN map).
UPDATE runs SET nbr_directory_id = 'tue-tigerwolves' WHERE id = 'tigerwolves';
UPDATE runs SET nbr_directory_id = 'mon-morning-easy' WHERE id = 'mmer';

