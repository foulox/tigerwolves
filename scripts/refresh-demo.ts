/**
 * Refresh the demo database from production and re-link all demo leaders.
 *
 * Usage:
 *   DATABASE_URL=<neon-demo-url> NEON_API_KEY=<key> CLERK_SECRET_KEY=<demo-clerk-key> \
 *     npx tsx scripts/refresh-demo.ts
 *
 * Required env vars:
 *   DATABASE_URL   — must point at the demo-data Neon branch (host ep-ancient-math-atvtz5p9)
 *   NEON_API_KEY   — Neon API key with access to project purple-star-02119717
 *   CLERK_SECRET_KEY — demo Clerk instance secret key (all DEMO_LEADERS must exist there)
 *
 * CRITICAL: this script guards against running against any other database.
 * It will throw immediately if DATABASE_URL does not contain the demo host.
 */

import { neon } from '@neondatabase/serverless'
import { createClerkClient } from '@clerk/nextjs/server'

// ── Constants (verbatim from story #346) ──────────────────────────────────────

const DEMO_HOST = 'ep-ancient-math-atvtz5p9'
const NEON_PROJECT_ID = 'purple-star-02119717'
const DEMO_BRANCH_ID = 'br-little-rice-at9l08ja'
const PRODUCTION_BRANCH_ID = 'br-square-river-atjn0mzq'
const DEMO_URL = 'https://demo.tigerwolves.foulox.me'

// ── Demo leaders — all must exist in the demo Clerk instance ─────────────────
// VERIFIED against prod run_leaders rows — use verbatim.

export const DEMO_LEADERS: { runId: string; email: string }[] = [
  { runId: 'tuesday-morning-tigerwolves', email: 'foulox@gmail.com' },
  { runId: 'wednesday-mourning-doves', email: 'cicifox@gmail.com' },
]

// ── Host guard helper (exported for unit testing) ─────────────────────────────

/**
 * Returns true only if the given url contains the demo-data Neon host.
 * Used to guard against accidentally running this script against production
 * or the E2E staging branch.
 */
export function isDemoHost(url: string | undefined): boolean {
  return !!url && url.includes(DEMO_HOST)
}

// ── buildRelinkPlan (exported for unit testing) ───────────────────────────────

/**
 * Given the DEMO_LEADERS list and a map of email -> resolved Clerk user id,
 * returns one relink descriptor per leader. Throws if ANY leader's email is
 * missing from the map (unresolved). Pure: no DB, no network, no env reads.
 */
export function buildRelinkPlan(
  leaders: { runId: string; email: string }[],
  idByEmail: Record<string, string>,
): { runId: string; email: string; clerkUserId: string }[] {
  const missing = leaders.filter(l => !idByEmail[l.email]).map(l => l.email)
  if (missing.length > 0) {
    throw new Error(
      `refresh-demo.ts: no Clerk user found for ${missing.join(', ')}. ` +
      `Ensure the demo Clerk account for that email exists in the demo Clerk instance ` +
      `and CLERK_SECRET_KEY is the demo key.`
    )
  }
  const plan = leaders.map(l => ({
    runId: l.runId,
    email: l.email,
    clerkUserId: idByEmail[l.email],
  }))
  // Each demo leader must be a distinct Clerk account. Two leaders resolving to the
  // same clerk_user_id (e.g. one Clerk account carrying both emails as addresses)
  // would silently relink two run_leaders rows to a single user — guard against it.
  const seenById = new Map<string, string>()
  for (const d of plan) {
    const prior = seenById.get(d.clerkUserId)
    if (prior) {
      throw new Error(
        `refresh-demo.ts: ${d.email} and ${prior} resolved to the same Clerk user id ` +
        `(${d.clerkUserId}) — each demo leader must be a distinct Clerk account.`
      )
    }
    seenById.set(d.clerkUserId, d.email)
  }
  return plan
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

  // Step 2: Resolve all DEMO_LEADERS emails against the demo Clerk instance in one call
  const emails = DEMO_LEADERS.map(l => l.email)
  console.log(`[1/5] Resolving Clerk users for ${emails.join(', ')}...`)
  const clerk = createClerkClient({ secretKey: clerkSecretKey })
  const { data: users } = await clerk.users.getUserList({ emailAddress: emails })

  // Build email -> clerk user id map, then validate via buildRelinkPlan.
  // Match against ALL of a user's email addresses (not just the primary) so a leader whose
  // demo login email is a secondary address still resolves.
  const idByEmail: Record<string, string> = {}
  for (const requestedEmail of emails) {
    const lower = requestedEmail.toLowerCase()
    const match = (users ?? []).find(u =>
      u.emailAddresses.some(e => e.emailAddress.toLowerCase() === lower)
    )
    if (match) idByEmail[requestedEmail] = match.id
  }
  const plan = buildRelinkPlan(DEMO_LEADERS, idByEmail)
  for (const d of plan) {
    console.log(`  ✓ Found Clerk user for ${d.email}: ${d.clerkUserId}`)
  }

  // Step 3: Restore demo branch from production via Neon API, then poll to completion
  console.log(`[2/5] Restoring demo branch (${DEMO_BRANCH_ID}) from production (${PRODUCTION_BRANCH_ID})...`)
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

  // #426: no fake Doves fixture is seeded here anymore. The restore above already
  // brings production's REAL runs (including the real Mourning Doves run) into the
  // demo, so there is nothing to fabricate.

  // Step 4: Re-link each demo leader by email (assert exactly 1 row matched per leader).
  // Email is the stable identity — the prod snapshot's rows already carry these
  // emails (backfilled in #385), so we only repoint clerk_user_id to the demo instance.
  console.log(`[3/5] Re-linking ${plan.length} demo leader(s)...`)
  for (const d of plan) {
    const updated = await sql`
      UPDATE run_leaders
      SET clerk_user_id = ${d.clerkUserId}, active = true
      WHERE run_id = ${d.runId} AND email = ${d.email}
      RETURNING id
    `
    if (updated.length !== 1) {
      throw new Error(
        `refresh-demo.ts: UPDATE run_leaders matched ${updated.length} row(s) for ` +
        `email="${d.email}" in run "${d.runId}" — expected exactly 1. ` +
        `Confirm the production row for this leader has its email backfilled (#385).`
      )
    }
    console.log(`  ✓ Leader re-linked (${d.email} → ${d.runId}, run_leaders.id = ${updated[0].id})`)
  }

  // Step 5: Self-follow for each leader (run_id is per-leader, not hardcoded)
  console.log(`[4/5] Ensuring each demo leader self-follows their run...`)
  for (const d of plan) {
    await sql`
      INSERT INTO runner_follows (clerk_user_id, run_id)
      VALUES (${d.clerkUserId}, ${d.runId})
      ON CONFLICT DO NOTHING
    `
    console.log(`  ✓ Self-follow asserted (${d.email} → ${d.runId})`)
  }

  // Step 6: Invalidate demo app cache (best-effort).
  // The demo is now its own Vercel PRODUCTION deployment, and /api/e2e-revalidate is
  // gated off in production (isSeedAllowed → VERCEL_ENV !== 'production'), so this POST
  // returns 403. It also fails from a network that blocks the demo domain. Either way
  // the DB relink above has already succeeded — the only cost of a failed flush is that
  // fetchData's cache serves stale reads until its 5-minute revalidate window elapses.
  // So we warn and finish successfully instead of throwing away a completed rebuild.
  console.log(`[5/5] Invalidating demo cache at ${DEMO_URL}/api/e2e-revalidate...`)
  try {
    const revalidateRes = await fetch(`${DEMO_URL}/api/e2e-revalidate`, { method: 'POST' })
    if (revalidateRes.ok) {
      console.log('  ✓ Cache invalidated')
    } else {
      console.warn(
        `  ⚠ Cache revalidation returned ${revalidateRes.status} ${revalidateRes.statusText}. ` +
        `The demo data was refreshed; the cache will self-heal within ~5 minutes.`
      )
    }
  } catch (err) {
    console.warn(
      `  ⚠ Cache revalidation request failed (${err instanceof Error ? err.message : String(err)}). ` +
      `The demo data was refreshed; the cache will self-heal within ~5 minutes.`
    )
  }

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
