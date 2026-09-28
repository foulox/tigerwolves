-- scripts/migrate-460.sql
-- #460: leader-confirmed landmark route narrative, generated from the route trace.
-- Additive + nullable + replay-safe. NULL when the route has no link, isn't
-- Strava/MapMyRun, yielded no geometry, or generation failed.
ALTER TABLE workout_families ADD COLUMN IF NOT EXISTS route_narrative TEXT;
