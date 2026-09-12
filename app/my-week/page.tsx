import Link from 'next/link'
import { currentUser } from '@clerk/nextjs/server'
import { getFollowedRunIds, getMyWeek } from '@/lib/db'
import { addDays } from '@/lib/myWeek'
import { getVoteData, workoutVoteId } from '@/lib/votes'
import Header from '@/components/Header'
import MyWeekClient from '@/components/MyWeekClient'

// #331 My Week — the cross-run home. Auth-required: it is deliberately NOT listed
// in proxy.ts's public routes, so clerkMiddleware's auth.protect() redirects a
// logged-out visitor to /sign-in before this renders. Making it the app's actual
// `/` home + entry routing is R4 (#332); for R3 it lives at /my-week, reachable
// by URL.
export default async function MyWeekPage() {
  const user = await currentUser()
  // auth.protect() guarantees a session; this guard only narrows the type.
  if (!user) return null

  const isLeader = user.publicMetadata?.role === 'leader'

  // 0 follows is distinct from "follows but nothing scheduled this window" — the
  // empty state is specifically the new-runner prompt, so key it on follow count.
  const followedIds = await getFollowedRunIds(user.id)
  if (followedIds.length === 0) {
    return (
      <div>
        <Header title="My Week" subtitle="Across the runs you follow" isLeader={isLeader} />
        <div className="px-4 py-10 text-center" data-testid="my-week-empty">
          <p className="text-gray-900 font-semibold">You&apos;re not following any runs yet.</p>
          <p className="mt-1 text-sm text-gray-500">
            Find a run to follow and this week&apos;s workouts will show up here.
          </p>
          <Link
            href="/all-runs"
            data-testid="my-week-empty-cta"
            className="mt-5 inline-flex items-center rounded-full bg-orange-500 px-5 py-2.5 text-sm font-bold text-white shadow-sm touch-manipulation"
          >
            Browse all runs →
          </Link>
        </div>
      </div>
    )
  }

  const today = new Date().toISOString().slice(0, 10)
  // Fetch a broad range once so the date strip can page ±weeks client-side
  // without an auth round-trip per nav. Covers one week back through ~4 weeks out.
  const items = await getMyWeek(user.id, addDays(today, -9), addDays(today, 35))

  const voteIds = items
    .map(i => i.workout)
    .filter((w): w is NonNullable<typeof w> => w !== null)
    .map(w => workoutVoteId(w.name, w.label ?? ''))
  const voteData = await getVoteData(voteIds)

  return (
    <div>
      <Header title="My Week" subtitle="Across the runs you follow" isLeader={isLeader} />
      <MyWeekClient items={items} today={today} voteData={voteData} />
    </div>
  )
}
