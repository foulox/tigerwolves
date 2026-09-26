import { currentUser } from '@clerk/nextjs/server'
import Header from '@/components/Header'
import AllRunsClient from '@/components/AllRunsClient'
import { getDirectoryRuns, getFollowedRunIds, getLeaderRun } from '@/lib/db'
import { shouldShowIntro } from '@/lib/allRunsIntro'

export const metadata = { title: 'All Runs — TigerWolves' }

export default async function AllRunsPage() {
  const user = await currentUser()
  const isLoggedIn = !!user
  const isLeader = user?.publicMetadata?.role === 'leader'
  const isAdmin = user?.publicMetadata?.admin === true
  // serverDate passed as a prop so AllRunsClient's SSR and client renders agree on "today",
  // preventing React hydration mismatches from server/client timezone drift.
  const serverDate = new Date().toISOString().slice(0, 10)

  const dbRuns = await getDirectoryRuns()
  let followedIds: string[] = []
  let owningLeaderRunId: string | null = null
  if (user) {
    followedIds = await getFollowedRunIds(user.id)
    if (isLeader) owningLeaderRunId = (await getLeaderRun(user.id))?.id ?? null
  }
  // Anonymous never sees draft rows.
  const visibleRuns = isLoggedIn ? dbRuns : dbRuns.filter(r => r.status !== 'draft')
  const showIntro = shouldShowIntro(isLoggedIn, followedIds.length)

  return (
    <div>
      <Header title="All Runs" isLeader={isLeader} />
      <AllRunsClient
        runs={visibleRuns}
        viewer={{ isLoggedIn, isAdmin, owningLeaderRunId }}
        initialFollowedIds={followedIds}
        serverDate={serverDate}
        showIntro={showIntro}
      />
    </div>
  )
}
