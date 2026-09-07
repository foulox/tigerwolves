import { currentUser } from '@clerk/nextjs/server'
import Header from '@/components/Header'
import AllRunsClient from '@/components/AllRunsClient'
import { NBR_RUNS } from '@/lib/allRunsData'

export const metadata = { title: 'All Runs — TigerWolves' }

export default async function AllRunsPage() {
  const user = await currentUser()
  const isLeader = user?.publicMetadata?.role === 'leader'
  // serverDate passed as a prop so AllRunsClient's SSR and client renders agree on "today",
  // preventing React hydration mismatches from server/client timezone drift.
  const serverDate = new Date().toISOString().slice(0, 10)

  return (
    <div>
      <Header title="All Runs" isLeader={isLeader} />
      <AllRunsClient runs={NBR_RUNS} serverDate={serverDate} />
    </div>
  )
}
