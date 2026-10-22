-- scripts/migrate-502.sql
-- #448: per-run recurrence (RRULE). Add the rule + anchor columns and seed the
-- five monthly food runs so they stop rendering every Friday. Null rrule ⇒ the
-- app's weekly-on-day_of_week default (back-compat for all other runs).
-- Idempotent: ADD ... IF NOT EXISTS; constant UPDATEs are replay-safe no-ops.
--
-- The RRULE component separator is ';' (RFC 5545). scripts/run-migrate.ts splits
-- a migration into statements on ';' WITHOUT quote awareness (parseStatements),
-- so a literal ';' inside a string would be cut mid-value ("unterminated quoted
-- string"). We build the ';' with chr(59) so the only bare ';' in each line is
-- the real statement terminator. Stored value is exactly 'FREQ=MONTHLY;BYDAY=nFR'.

ALTER TABLE runs ADD COLUMN IF NOT EXISTS rrule TEXT;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS rrule_dtstart DATE;

UPDATE runs SET rrule = 'FREQ=MONTHLY' || chr(59) || 'BYDAY=1FR', rrule_dtstart = '2020-01-03' WHERE id = 'first-friday-salmon-run';
UPDATE runs SET rrule = 'FREQ=MONTHLY' || chr(59) || 'BYDAY=2FR', rrule_dtstart = '2020-01-03' WHERE id = 'second-friday-donut-run';
UPDATE runs SET rrule = 'FREQ=MONTHLY' || chr(59) || 'BYDAY=3FR', rrule_dtstart = '2020-01-03' WHERE id = 'third-friday-ice-cream-run';
UPDATE runs SET rrule = 'FREQ=MONTHLY' || chr(59) || 'BYDAY=4FR', rrule_dtstart = '2020-01-03' WHERE id = 'fourth-friday-bagel-run';
UPDATE runs SET rrule = 'FREQ=MONTHLY' || chr(59) || 'BYDAY=2FR', rrule_dtstart = '2020-01-03' WHERE id = 'second-friday-brewery-run';
