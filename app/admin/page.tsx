import { Suspense } from 'react'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { fetchData } from '@/lib/db'
import Header from '@/components/Header'
import RegroupWorkoutsForm from '@/components/RegroupWorkoutsForm'

export default async function AdminPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  const { workouts } = await fetchData()
  return (
    <div>
      <Header title="Admin" isLeader={true} />
      <Suspense>
        <RegroupWorkoutsForm workouts={workouts} />
      </Suspense>
    </div>
  )
}
