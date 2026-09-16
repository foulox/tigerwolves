/**
 * Refresh the demo database from production and re-link the demo leader.
 *
 * Usage:
 *   DATABASE_URL=<neon-demo-url> NEON_API_KEY=<key> CLERK_SECRET_KEY=<dev-clerk-key> \
 *     npx tsx scripts/refresh-demo.ts
 *
 * Required env vars:
 *   DATABASE_URL   — must point at the demo-data Neon branch (host ep-ancient-math-atvtz5p9)
 *   NEON_API_KEY   — Neon API key with access to project purple-star-02119717
 *   CLERK_SECRET_KEY — dev Clerk instance secret key (the demo leader lives there)
 *
 * CRITICAL: this script guards against running against any other database.
 * It will throw immediately if DATABASE_URL does not contain the demo host.
 */

import { neon } from '@neondatabase/serverless'
import { createClerkClient } from '@clerk/nextjs/server'
import { seedDovesLongRun } from './fixtures/dovesLongRun'

// ── Constants (verbatim from story #346) ──────────────────────────────────────

const DEMO_HOST = 'ep-ancient-math-atvtz5p9'
const NEON_PROJECT_ID = 'purple-star-02119717'
const DEMO_BRANCH_ID = 'br-little-rice-at9l08ja'
const PRODUCTION_BRANCH_ID = 'br-square-river-atjn0mzq'
const DEMO_LEADER_NAME = 'Lou Fox'
const DEMO_LEADER_EMAIL = 'foulox+demo@gmail.com'
const DEMO_URL = 'https://demo.tigerwolves.foulox.me'

// ── Host guard helper (exported for unit testing) ─────────────────────────────

/**
 * Returns true only if the given url contains the demo-data Neon host.
 * Used to guard against accidentally running this script against production
 * or the E2E staging branch.
 */
export function isDemoHost(url: string | undefined): boolean {
  return !!url && url.includes(DEMO_HOST)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Poll a Neon operation until it finishes. Throws on failure. */
async function waitForOperation(operationId: string, apiKey: string): Promise<void> {
  const url = `https://console.neon.tech/api/v2/projects/${NEON_PROJECT_ID}/operations/${operationId}`
  for (;;) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } })
    if (!res.ok) throw new Error(`Failed to poll operation ${operationId}: ${res.status} ${res.statusText}`)
    const { operation } = (await res.json()) as { operation: { id: string; status: string } }
    if (operation.status === 'finished') return
    if (operation.status === 'failed' || operation.status === 'error') {
      throw new Error(`Neon operation ${operationId} reached status: ${operation.status}`)
    }
    // Brief pause before next poll
    await new Promise(r => setTimeout(r, 1500))
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Step 1: Host guard — must be first, fail loudly
  if (!isDemoHost(process.env.DATABASE_URL)) {
    throw new Error(
      `refresh-demo.ts refuses to run: DATABASE_URL does not point at the demo-data Neon branch ` +
      `(expected host ${DEMO_HOST}). Set DATABASE_URL to the demo connection string.`
    )
  }

  const neonApiKey = process.env.NEON_API_KEY
  if (!neonApiKey) throw new Error('NEON_API_KEY is not set')
  const clerkSecretKey = process.env.CLERK_SECRET_KEY
  if (!clerkSecretKey) throw new Error('CLERK_SECRET_KEY is not set')

  // Step 2: Resolve Clerk user ID at runtime — no hardcoded ID
  console.log(`[1/6] Resolving Clerk user for ${DEMO_LEADER_EMAIL}...`)
  const clerk = createClerkClient({ secretKey: clerkSecretKey })
  const { data: users } = await clerk.users.getUserList({ emailAddress: [DEMO_LEADER_EMAIL] })
  if (!users || users.length === 0) {
    throw new Error(
      `refresh-demo.ts: no Clerk user found for ${DEMO_LEADER_EMAIL}. ` +
      `Ensure the demo account exists in the dev Clerk instance and CLERK_SECRET_KEY is the dev key.`
    )
  }
  const clerkUserId = users[0].id
  console.log(`  ✓ Found Clerk user: ${clerkUserId}`)

  // Step 3: Restore demo branch from production via Neon API, then poll to completion
  console.log(`[2/6] Restoring demo branch (${DEMO_BRANCH_ID}) from production (${PRODUCTION_BRANCH_ID})...`)
  const restoreRes = await fetch(
    `https://console.neon.tech/api/v2/projects/${NEON_PROJECT_ID}/branches/${DEMO_BRANCH_ID}/restore`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${neonApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ source_branch_id: PRODUCTION_BRANCH_ID }),
    }
  )
  if (!restoreRes.ok) {
    const body = await restoreRes.text()
    throw new Error(`Neon restore failed: ${restoreRes.status} ${restoreRes.statusText} — ${body}`)
  }
  const { operations } = (await restoreRes.json()) as { operations: { id: string }[] }
  console.log(`  Polling ${operations.length} operation(s)...`)
  for (const op of operations) {
    console.log(`  Waiting for operation ${op.id}...`)
    await waitForOperation(op.id, neonApiKey)
    console.log(`  ✓ Operation ${op.id} finished`)
  }
  console.log('  ✓ Branch restore complete')

  const sql = neon(process.env.DATABASE_URL!)

  // Step 3.5: Seed the durable Mourning Doves Long/route run. The restore above
  // reset demo-data to a production snapshot (which has no 'doves' run), so the
  // demo always carries production PLUS the doves runs — a real Long/route run to
  // exercise #382's route-run preview. The helper is fixture-scoped (only ever
  // touches run_id 'doves'), so it can't disturb the restored production data.
  console.log(`[3/6] Seeding Mourning Doves Long/route run fixture...`)
  await seedDovesLongRun(sql)
  console.log('  ✓ Doves Long run seeded')

  // Step 4: Re-link the demo leader (assert exactly 1 row matched)
  console.log(`[4/6] Re-linking demo leader "${DEMO_LEADER_NAME}" (${DEMO_LEADER_EMAIL})...`)
  const updated = await sql`
    UPDATE run_leaders
    SET clerk_user_id = ${clerkUserId}, active = true
    WHERE run_id = 'tigerwolves' AND name = ${DEMO_LEADER_NAME}
    RETURNING id
  `
  if (updated.length !== 1) {
    throw new Error(
      `refresh-demo.ts: UPDATE run_leaders matched ${updated.length} row(s) for ` +
      `name="${DEMO_LEADER_NAME}" in run "tigerwolves" — expected exactly 1. ` +
      `Check DEMO_LEADER_NAME matches the row in the database.`
    )
  }
  console.log(`  ✓ Leader re-linked (run_leaders.id = ${updated[0].id})`)

  // Step 5: Self-follow
  console.log(`[5/6] Ensuring demo leader self-follows tigerwolves...`)
  await sql`
    INSERT INTO runner_follows (clerk_user_id, run_id)
    VALUES (${clerkUserId}, 'tigerwolves')
    ON CONFLICT DO NOTHING
  `
  console.log('  ✓ Self-follow asserted')

  // Step 6: Invalidate demo app cache
  console.log(`[6/6] Invalidating demo cache at ${DEMO_URL}/api/e2e-revalidate...`)
  const revalidateRes = await fetch(`${DEMO_URL}/api/e2e-revalidate`, { method: 'POST' })
  if (!revalidateRes.ok) {
    throw new Error(
      `Cache revalidation failed: ${revalidateRes.status} ${revalidateRes.statusText}. ` +
      `The demo data was refreshed but the cache may be stale for up to 5 minutes.`
    )
  }
  console.log('  ✓ Cache invalidated')

  console.log('\nDone. Demo environment refreshed from production.')
}

// ── Direct-run guard — import-safe ────────────────────────────────────────────
// Importing this module (e.g. from __tests__/refreshDemo.test.ts) must NOT
// execute main(). Only run main when this file is invoked directly via tsx.

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
