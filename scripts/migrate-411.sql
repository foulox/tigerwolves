-- Story #411: variant-level map links.
-- Run against the PR's Preview branch first, then the E2E-wipe/staging, production,
-- and demo-data branches (see CLAUDE.md "A migration reaches FOUR branches").
-- Idempotent (ADD COLUMN IF NOT EXISTS) — safe to replay; required for the demo-schema
-- auto-sync (sync-demo-schema.yml replays the whole set on every merge to main).
--
-- Why: #401 put map_link on workout_families (one per route). Loading the real Mourning
-- Doves library (#411) surfaced 6 families whose two variants are genuinely DIFFERENT
-- routes with DIFFERENT map links (e.g. September 11 Memorial → BK Bridge vs Battery
-- Park). map_link belongs on the VARIANT for those; family map_link stays a fallback.
-- fetchWorkoutVariants reads COALESCE(wv.map_link, wf.map_link), so existing rows
-- (variant map_link NULL) are unchanged — they keep resolving to the family link.

ALTER TABLE workout_variants ADD COLUMN IF NOT EXISTS map_link TEXT;
