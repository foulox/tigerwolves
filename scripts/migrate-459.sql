-- scripts/migrate-459.sql
-- #459: Strava's own static route map image URL (public route page og:image).
-- Additive + nullable + replay-safe (ADD COLUMN IF NOT EXISTS). NULL when the
-- route has no link, isn't Strava, or the page yielded no og:image.
ALTER TABLE workout_families ADD COLUMN IF NOT EXISTS map_image_url TEXT;
