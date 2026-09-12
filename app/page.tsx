import { redirect } from 'next/navigation'
import { currentUser } from '@clerk/nextjs/server'
import { getFollowedRunIds } from '@/lib/db'
import { entryTarget } from '@/lib/entryRouting'

// #332 Home flip — `/` is no longer the Schedule page (that retired into the
// run-scoped page at /runs/[id], #329). It's now a pure router: send visitors to
// the right home based on auth + whether they follow any run. The decision is the
// pure `entryTarget` helper; this shell only supplies its inputs and redirects.
//
// `/` stays a public route in proxy.ts so this runs for logged-out visitors too
// (auth.protect() would otherwise bounce them to /sign-in before we can route).
export default async function Home() {
  const user = await currentUser()
  const followCount = user ? (await getFollowedRunIds(user.id)).length : 0
  redirect(entryTarget(Boolean(user), followCount))
}
