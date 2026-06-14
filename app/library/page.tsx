import { auth } from '@clerk/nextjs/server'
import { fetchData } from '@/lib/sheets'
import LibraryClient from '@/components/LibraryClient'

export default async function LibraryPage() {
  const { userId } = await auth()
  const { workouts } = await fetchData()
  return <LibraryClient workouts={workouts} isLeader={!!userId} />
}
