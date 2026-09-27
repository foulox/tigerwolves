-- scripts/migrate-457.sql
-- #457: authoritative route metrics fetched from the map link's provider (Strava).
-- All nullable + additive: routes without a link, or with a failed fetch, stay NULL and
-- behave exactly as before. ADD COLUMN IF NOT EXISTS makes the whole file replay-safe
-- (run-migrate.ts replays every migrate-*.sql on each merge; a second run is a no-op).
ALTER TABLE workout_families ADD COLUMN IF NOT EXISTS distance_miles      NUMERIC;
ALTER TABLE workout_families ADD COLUMN IF NOT EXISTS elevation_gain_feet NUMERIC;
ALTER TABLE workout_families ADD COLUMN IF NOT EXISTS geometry            JSONB;
