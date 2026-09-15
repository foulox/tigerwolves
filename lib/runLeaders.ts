// Shared helpers for Clerk-user resolution, run-leader display-name derivation,
// and the Clerk role grant that both addRunLeaderByEmail and activateNbrRun
// must perform when a leader is provisioned.
// Used by: app/run-config/actions.ts, app/admin/actions.ts.

import { clerkClient } from '@clerk/nextjs/server'

/** Minimal shape of a Clerk user — only fields we actually use. */
export interface ClerkUserLike {
  id: string
  firstName: string | null
  lastName: string | null
  username: string | null
  emailAddresses: Array<{ emailAddress: string }>
  publicMetadata: Record<string, unknown>
}

/**
 * Resolve an existing Clerk user by email address (exact, case-insensitive).
 * Returns null if no account matches — unknown email is not an error here;
 * callers decide what to do with null.
 */
export async function resolveClerkUserByEmail(email: string): Promise<ClerkUserLike | null> {
  const client = await clerkClient()
  const { data: matches } = await client.users.getUserList({ emailAddress: [email] })
  const found = matches.find(u =>
    u.emailAddresses.some(e => e.emailAddress.toLowerCase() === email)
  )
  if (!found) return null
  return {
    id: found.id,
    firstName: found.firstName ?? null,
    lastName: found.lastName ?? null,
    username: found.username ?? null,
    emailAddresses: found.emailAddresses.map(e => ({ emailAddress: e.emailAddress })),
    publicMetadata: (found.publicMetadata as Record<string, unknown>) ?? {},
  }
}

/**
 * Derive the roster display name from a Clerk user.
 * Priority: "First Last" → username → email prefix.
 */
export function leaderDisplayName(user: ClerkUserLike, fallbackEmail: string): string {
  return (
    [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
    user.username ||
    fallbackEmail.split('@')[0]
  )
}

/**
 * Grant the Clerk 'leader' role to a resolved Clerk user.
 *
 * IMPORTANT: Clerk's updateUser REPLACES publicMetadata in full — the spread of
 * existing metadata is mandatory so fields like admin: true are never clobbered.
 * This is the single canonical place for that merge so it can't be missed or
 * done inconsistently across call sites.
 */
export async function grantLeaderRole(
  clerkUser: { id: string; publicMetadata?: Record<string, unknown> | null }
): Promise<void> {
  const existing = clerkUser.publicMetadata ?? {}
  const client = await clerkClient()
  await client.users.updateUser(clerkUser.id, {
    publicMetadata: { ...existing, role: 'leader' },
  })
}
