import { fetchData } from '@/lib/sheets'
import RegroupWorkoutsForm from '@/components/RegroupWorkoutsForm'

export default async function AdminPage() {
  const { workouts } = await fetchData()
  return <RegroupWorkoutsForm workouts={workouts} />
}
