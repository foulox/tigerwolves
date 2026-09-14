import { currentUser } from '@clerk/nextjs/server'
import Header from '@/components/Header'
import AllRunsClient from '@/components/AllRunsClient'
import { NBR_RUNS } from '@/lib/allRunsData'
import type { NBRRun } from '@/lib/allRunsData'
import { getDirectoryRuns, getFollowedRunIds } from '@/lib/db'
import { computePlatformMap, mergeDirectory, type PlatformInfo } from '@/lib/allRuns'

export const metadata = { title: 'All Runs — TigerWolves' }

export default async function AllRunsPage() {
  const user = await currentUser()
  const isLeader = user?.publicMetadata?.role === 'leader'
  // serverDate passed as a prop so AllRunsClient's SSR and client renders agree on "today",
  // preventing React hydration mismatches from server/client timezone drift.
  const serverDate = new Date().toISOString().slice(0, 10)

  // Signed in → fetch real DB runs; build links from nbr_directory_id; merge + compute platform.
  // Signed out → runs stays NBR_RUNS, platform stays {} — directory-only, unchanged (AC5).
  let runs: NBRRun[] = NBR_RUNS
  let platform: Record<string, PlatformInfo> = {}
  if (user) {
    const [dbRuns, followedIds] = await Promise.all([
      getDirectoryRuns(),
      getFollowedRunIds(user.id),
    ])
    const links: Record<string, string> = {}
    for (const r of dbRuns) if (r.nbr_directory_id) links[r.nbr_directory_id] = r.id
    const existingRunIds = dbRuns.map(r => r.id)
    platform = computePlatformMap(existingRunIds, followedIds, links)
    runs = mergeDirectory(NBR_RUNS, dbRuns, links)
  }

  return (
    <div>
      <Header title="All Runs" isLeader={isLeader} />
      <AllRunsClient runs={runs} serverDate={serverDate} isLoggedIn={!!user} platform={platform} />
    </div>
  )
}
