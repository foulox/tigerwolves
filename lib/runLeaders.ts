// Shared helpers for Clerk-user resolution and run-leader display-name derivation.
// Used by both addRunLeaderByEmail (app/run-config/actions.ts) and
// activateNbrRun (app/admin/actions.ts) so the lookup logic lives in one place.

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
