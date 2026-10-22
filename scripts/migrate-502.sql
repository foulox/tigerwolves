-- scripts/migrate-502.sql
-- #448: per-run recurrence (RRULE). Add the rule + anchor columns and seed the
-- five monthly food runs so they stop rendering every Friday. Null rrule ⇒ the
-- app's weekly-on-day_of_week default (back-compat for all other runs).
-- Idempotent: ADD ... IF NOT EXISTS; constant UPDATEs are replay-safe no-ops.

ALTER TABLE runs ADD COLUMN IF NOT EXISTS rrule TEXT;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS rrule_dtstart DATE;

UPDATE runs SET rrule = 'FREQ=MONTHLY;BYDAY=1FR', rrule_dtstart = '2020-01-03' WHERE id = 'first-friday-salmon-run';
UPDATE runs SET rrule = 'FREQ=MONTHLY;BYDAY=2FR', rrule_dtstart = '2020-01-03' WHERE id = 'second-friday-donut-run';
UPDATE runs SET rrule = 'FREQ=MONTHLY;BYDAY=3FR', rrule_dtstart = '2020-01-03' WHERE id = 'third-friday-ice-cream-run';
UPDATE runs SET rrule = 'FREQ=MONTHLY;BYDAY=4FR', rrule_dtstart = '2020-01-03' WHERE id = 'fourth-friday-bagel-run';
UPDATE runs SET rrule = 'FREQ=MONTHLY;BYDAY=2FR', rrule_dtstart = '2020-01-03' WHERE id = 'second-friday-brewery-run';
