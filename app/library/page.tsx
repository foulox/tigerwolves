import { auth } from '@clerk/nextjs/server'
import { fetchData } from '@/lib/sheets'
import LibraryClient from '@/components/LibraryClient'
import LeaderBadge from '@/components/LeaderBadge'

export default async function LibraryPage() {
  const { userId } = await auth()
  const isLeader = !!userId
  const { workouts } = await fetchData()
  return (
    <div className="relative">
      <LeaderBadge isLeader={isLeader} />
      <LibraryClient workouts={workouts} isLeader={isLeader} />
    </div>
  )
}
