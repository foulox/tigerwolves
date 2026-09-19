-- Story #426: retire the orphan legacy `Tempo` workout type.
-- Run against the PR's Preview branch first, then the E2E-wipe/staging branch (so
-- CI's test:unit passes), then production at merge, then demo-data. Idempotent —
-- a constant UPDATE with a WHERE that matches nothing on replay — safe to run in
-- scripts/run-migrate.ts's full replay every merge (per CLAUDE.md's idempotency rule).
--
-- Why: `Tempo` is legacy data (a single "Generic Tempo" family) that predates the
-- canonical WORKOUT_TYPE_OPTIONS in lib/runProfile.ts, whose tempo type is
-- "Straight Tempo". Retyping folds the orphan into the canonical type so no `Tempo`
-- remains and every family carries a type the UI actually offers.

UPDATE workout_families SET type = 'Straight Tempo' WHERE type = 'Tempo';
