import { auth } from '@clerk/nextjs/server'
import { fetchData } from '@/lib/db'
import LibraryClient from '@/components/LibraryClient'
import Header from '@/components/Header'
import { getVoteData, workoutVoteId } from '@/lib/votes'

export default async function LibraryPage() {
  const { userId } = await auth()
  const isLeader = !!userId
  const { workouts } = await fetchData()
  const voteData = await getVoteData(workouts.map(w => workoutVoteId(w.name, w.variation)))
  return (
    <div>
      <Header title="Library" isLeader={isLeader} />
      <LibraryClient workouts={workouts} isLeader={isLeader} voteData={voteData} />
    </div>
  )
}
