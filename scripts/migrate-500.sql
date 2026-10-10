-- scripts/migrate-500.sql
-- Story 1 of #423: per-run configurable card layout.
-- Nullable JSONB; NULL = default layout (lib/cardLayout.ts). No backfill —
-- existing runs render exactly as today until a leader saves a layout.
-- ADD COLUMN IF NOT EXISTS makes the whole file replay-safe.
ALTER TABLE runs ADD COLUMN IF NOT EXISTS card_template JSONB;
