import { neon } from '@neondatabase/serverless'

// Shared, idempotent fixture writers for the preview seed (#327). Kept separate
// from lib/db.ts's read/cache layer because these bypass the app's mutation
// paths — they're only ever run against a non-production database.
//
// The Neon client is created lazily (not at module load) so this module can be
// imported in unit tests / the guard check without a DATABASE_URL present.
function db() {
  return neon(process.env.DATABASE_URL!)
}

// The one gate for the preview-seed endpoint: never in production. VERCEL_ENV is
// 'production' | 'preview' | 'development' on Vercel, and undefined locally
// (treated as allowed). Extracted so it's unit-testable without importing the
// route's Clerk/Next dependencies.
export function isSeedAllowed(vercelEnv: string | undefined): boolean {
  return vercelEnv !== 'production'
}

// Ensure a run row exists. ON CONFLICT DO NOTHING so re-running never resets a
// run's config — critical for the "configure a new run" flow: once a leader has
// filled in MMER's settings, re-hitting the seed leaves their work untouched.
// New runs are created with blank editable text fields (so the config-editing
// tabs render cleanly) and a sensible default kind.
export async function ensureRun(run: { id: string; name: string; kind?: string }): Promise<void> {
  const sql = db()
  await sql`
    INSERT INTO runs (id, name, kind, post_header, meeting_location, closing_notes, leader_intro)
    VALUES (${run.id}, ${run.name}, ${run.kind ?? 'Workout'}, '', '', '', 'Run Leaders:')
    ON CONFLICT (id) DO NOTHING
  `
}

// Ensure a Clerk user is linked as a leader of a run. Idempotent by
// (run_id, clerk_user_id): if the link already exists (e.g. a preview branched
// from production where the real leader row is present) it's a no-op and no
// duplicate roster row is created. `name` is only used when inserting a new row.
export async function ensureLeaderLink(params: {
  runId: string
  clerkUserId: string
  name: string
}): Promise<boolean> {
  const sql = db()
  const existing = await sql`
    SELECT 1 FROM run_leaders
    WHERE run_id = ${params.runId} AND clerk_user_id = ${params.clerkUserId}
    LIMIT 1
  `
  if (existing.length > 0) return false
  await sql`
    INSERT INTO run_leaders (run_id, name, clerk_user_id, active, sort_order)
    VALUES (${params.runId}, ${params.name}, ${params.clerkUserId}, true, 1)
    ON CONFLICT (run_id, name) DO UPDATE SET clerk_user_id = EXCLUDED.clerk_user_id, active = true
  `
  return true
}
