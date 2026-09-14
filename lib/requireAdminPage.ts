import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

type ClerkUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>

/**
 * Page-level admin gate (#349). Route-level defense-in-depth in front of the
 * admin-only pages (/admin/create-run): a signed-in NON-admin who types one of
 * those URLs is redirected to '/', rather than shown a page whose every write
 * would be rejected by the admin check in the createRun action anyway. Mirrors
 * the redirect requireLeaderPage already performs.
 *
 * proxy.ts already blocks anonymous visits, so in practice `user` is non-null
 * here; the null branch is belt-and-suspenders. redirect() throws NEXT_REDIRECT,
 * so a non-admin never executes past this call. Returns the resolved admin so
 * callers can reuse it without a second currentUser() round-trip.
 */
export async function requireAdminPage(): Promise<ClerkUser> {
  const user = await currentUser()
  if (user?.publicMetadata?.admin !== true) redirect('/')
  return user
}
