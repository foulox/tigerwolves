-- Story #384: Remove the orphaned WARMUP DESCRIPTION field
-- Deploy the code first (new code no longer SELECTs this column), then run this DROP.
-- Dropping before the old code is gone would 500 the live db.ts SELECT.
-- The field was a pure round-trip: input → warmup_description → read back → echoed
-- into the same textarea. Post generation (lib/postBuilder.ts) never read it.

ALTER TABLE runs DROP COLUMN IF EXISTS warmup_description;
