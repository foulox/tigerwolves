-- Story #353: Draft / pre-launch run state
-- Run against Preview branch first, then production after PR merges.
-- Existing rows backfill to 'live' via the DEFAULT; new inserts write 'draft' via the app.

ALTER TABLE runs ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'live';
