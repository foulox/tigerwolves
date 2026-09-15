// Shared helpers for Clerk-user resolution, run-leader display-name derivation,
// and the Clerk role grant/revoke that both addRunLeaderByEmail/removeRunLeader
// and activateNbrRun must perform when a leader is provisioned or removed.
// Used by: app/run-config/actions.ts, app/admin/actions.ts.

import { clerkClient } from '@clerk/nextjs/server'
import { leadsAnyActiveRun } from './db'

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
 *
 * Must be called AFTER a successful roster INSERT so a failed insert never
 * leaves a dangling global 'leader' role.
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

/**
 * Conditionally revoke the Clerk 'leader' role from a user who was just removed
 * from a run's roster.
 *
 * The revoke is skipped if the user still leads ANY other active run — the role
 * must stay for them to access their remaining run's leader surfaces.
 *
 * Preserves all other publicMetadata keys (e.g. admin: true). Only the 'role'
 * key is stripped. This is a no-op if the user still leads another run.
 *
 * Must be called AFTER the target run_leaders row has been deactivated (active =
 * false) so leadsAnyActiveRun returns false for the deactivated run.
 */
export async function revokeLeaderRoleIfOrphaned(clerkUserId: string): Promise<void> {
  if (await leadsAnyActiveRun(clerkUserId)) return

  const client = await clerkClient()
  const user = await client.users.getUser(clerkUserId)
  const existing = (user.publicMetadata as Record<string, unknown>) ?? {}
  // Strip only the 'role' key — preserve admin, and any future keys.
  const { role: _stripped, ...rest } = existing
  void _stripped // intentionally unused — destructured to remove from spread
  await client.users.updateUser(clerkUserId, {
    publicMetadata: rest,
  })
}
