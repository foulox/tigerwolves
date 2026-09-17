/**
 * Backfill run_leaders.email from each row's linked Clerk account (#385).
 *
 * Email becomes the cross-environment identity/link key for run leaders, but it
 * can't be the key until it's stored. This script resolves every run_leaders row
 * that has a clerk_user_id to that account's primary email and writes it back.
 *
 * Usage:
 *   DATABASE_URL=<neon-url> CLERK_SECRET_KEY=<prod-clerk-key> \
 *     [REVALIDATE_URL=https://<deployment>] npx tsx scripts/backfill-leader-emails.ts
 *
 * Required env vars:
 *   DATABASE_URL     — the target Neon branch (production, or the PR's Preview branch)
 *   CLERK_SECRET_KEY — the PRODUCTION Clerk instance key. Preview's forked rows carry
 *                      production Clerk ids, so resolve against prod regardless of
 *                      which Clerk instance the app itself runs on.
 * Optional:
 *   REVALIDATE_URL   — deployment base URL; if set, POSTs {url}/api/e2e-revalidate
 *                      after writing (raw-SQL writes bypass the app cache — CLAUDE.md
 *                      cache-invalidation guardrail).
 *
 * NOT host-locked: this runs against production AND Preview by design.
 */

import { neon } from '@neondatabase/serverless'
import { createClerkClient } from '@clerk/nextjs/server'

// ── Pure helper (exported for unit testing) ───────────────────────────────────

/** Minimal Clerk-user shape the backfill actually reads. */
export interface ClerkUserEmails {
  primaryEmailAddressId: string | null
  emailAddresses: Array<{ id: string; emailAddress: string }>
}

/**
 * Return the account's primary email address, lowercased, or null if the account
 * has no email addresses. Falls back to the first address when the primary id
 * doesn't match any entry (defensive — Clerk should always have a primary).
 */
export function primaryEmail(user: ClerkUserEmails): string | null {
  const list = user.emailAddresses ?? []
  if (list.length === 0) return null
  const primary = list.find(e => e.id === user.primaryEmailAddressId)
  return (primary ?? list[0]).emailAddress.toLowerCase()
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set')
  const clerkSecretKey = process.env.CLERK_SECRET_KEY
  if (!clerkSecretKey) throw new Error('CLERK_SECRET_KEY is not set')

  const sql = neon(process.env.DATABASE_URL)
  const clerk = createClerkClient({ secretKey: clerkSecretKey })

  const rows = await sql`
    SELECT id, run_id, name, clerk_user_id, email
    FROM run_leaders
    ORDER BY run_id, sort_order
  `
  console.log(`Found ${rows.length} run_leaders row(s).`)

  let updated = 0
  let skipped = 0
  let unresolved = 0

  for (const row of rows) {
    const clerkUserId = row.clerk_user_id as string | null
    if (!clerkUserId) {
      console.log(`  skip: ${row.run_id}/"${row.name}" (id=${row.id}) — no clerk_user_id`)
      skipped++
      continue
    }

    let email: string | null
    try {
      const user = await clerk.users.getUser(clerkUserId)
      email = primaryEmail(user)
    } catch (err) {
      const status = (err as { status?: number })?.status
      console.log(
        `  unresolved: ${row.run_id}/"${row.name}" (id=${row.id}) — Clerk ${status ?? 'error'} for ${clerkUserId}`
      )
      unresolved++
      continue
    }

    if (!email) {
      console.log(`  unresolved: ${row.run_id}/"${row.name}" (id=${row.id}) — no email on Clerk account`)
      unresolved++
      continue
    }

    await sql`UPDATE run_leaders SET email = ${email} WHERE id = ${row.id}`
    console.log(`  ✓ ${row.run_id}/"${row.name}" (id=${row.id}) → ${email}`)
    updated++
  }

  console.log(`\nDone. updated=${updated} skipped=${skipped} unresolved=${unresolved}`)

  // Raw-SQL writes bypass the app cache; flush it the same way a Server Action
  // write would (CLAUDE.md cache-invalidation guardrail). email isn't itself a
  // displayed field, but do it anyway so read-your-own-writes holds.
  const revalidateUrl = process.env.REVALIDATE_URL
  if (revalidateUrl) {
    const res = await fetch(`${revalidateUrl}/api/e2e-revalidate`, { method: 'POST' })
    if (!res.ok) {
      throw new Error(`Cache revalidation failed: ${res.status} ${res.statusText} at ${revalidateUrl}`)
    }
    console.log(`✓ Cache invalidated at ${revalidateUrl}`)
  } else {
    console.log('REVALIDATE_URL not set — skipping cache flush (email is not a displayed field).')
  }
}

// ── Direct-run guard — import-safe (so the unit test can import primaryEmail) ──

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(err)
    process.exit(1)
  })
}
