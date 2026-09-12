import { currentUser } from '@clerk/nextjs/server'
import Header from '@/components/Header'
import AllRunsClient from '@/components/AllRunsClient'
import { NBR_RUNS } from '@/lib/allRunsData'
import { getAllRunIds, getFollowedRunIds } from '@/lib/db'
import { computePlatformMap, type PlatformInfo } from '@/lib/allRuns'

export const metadata = { title: 'All Runs — TigerWolves' }

export default async function AllRunsPage() {
  const user = await currentUser()
  const isLeader = user?.publicMetadata?.role === 'leader'
  // serverDate passed as a prop so AllRunsClient's SSR and client renders agree on "today",
  // preventing React hydration mismatches from server/client timezone drift.
  const serverDate = new Date().toISOString().slice(0, 10)

  // Signed in → mark which NBR entries are joinable platform runs (+ follow state).
  // Signed out → empty map, so AllRunsClient renders today's marketing directory unchanged.
  let platform: Record<string, PlatformInfo> = {}
  if (user) {
    const [runIds, followedIds] = await Promise.all([
      getAllRunIds(),
      getFollowedRunIds(user.id),
    ])
    platform = computePlatformMap(runIds, followedIds)
  }

  return (
    <div>
      <Header title="All Runs" isLeader={isLeader} />
      <AllRunsClient runs={NBR_RUNS} serverDate={serverDate} isLoggedIn={!!user} platform={platform} />
    </div>
  )
}
