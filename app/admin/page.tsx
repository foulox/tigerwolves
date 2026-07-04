import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { fetchData } from '@/lib/db'
import RegroupWorkoutsForm from '@/components/RegroupWorkoutsForm'

export default async function AdminPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  const { workouts } = await fetchData()
  return <RegroupWorkoutsForm workouts={workouts} />
}
