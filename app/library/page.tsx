import { currentUser } from '@clerk/nextjs/server'
import { fetchData } from '@/lib/db'
import LibraryClient from '@/components/LibraryClient'
import Header from '@/components/Header'
import { getVoteData, workoutVoteId } from '@/lib/votes'

export default async function LibraryPage() {
  const user = await currentUser()
  const isLeader = user?.publicMetadata?.role === 'leader'
  const { workoutVariants } = await fetchData()
  const voteData = await getVoteData(workoutVariants.map(w => workoutVoteId(w.name, w.label ?? '')))
  return (
    <div>
      <Header title="Library" isLeader={isLeader} />
      <LibraryClient variants={workoutVariants} isLeader={isLeader} voteData={voteData} />
    </div>
  )
}
