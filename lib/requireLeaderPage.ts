import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

type ClerkUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>

/**
 * Page-level leader gate (#337). Route-level defense-in-depth in front of the
 * leader-only pages (/plan, /library/add, /library/edit): a signed-in NON-leader
 * who types one of those URLs is redirected to '/', rather than shown a page
 * whose every write would be rejected by requireAuth() anyway. Mirrors the
 * redirect /run-config already performs (see runConfigGate).
 *
 * proxy.ts already blocks anonymous visits, so in practice `user` is non-null
 * here; the null branch is belt-and-suspenders. redirect() throws NEXT_REDIRECT,
 * so a non-leader never executes past this call. Returns the resolved leader so
 * callers can reuse it without a second currentUser() round-trip.
 */
export async function requireLeaderPage(): Promise<ClerkUser> {
  const user = await currentUser()
  if (user?.publicMetadata?.role !== 'leader') redirect('/')
  return user
}
