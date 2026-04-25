import { fetchData } from '@/lib/sheets'
import LibraryClient from '@/components/LibraryClient'

export default async function LibraryPage() {
  const { workouts } = await fetchData()
  return <LibraryClient workouts={workouts} />
}
