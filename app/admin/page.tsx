import { Suspense } from 'react'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { fetchData } from '@/lib/db'
import Header from '@/components/Header'
import RegroupWorkoutsForm from '@/components/RegroupWorkoutsForm'

export default async function AdminPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  const { workoutVariants } = await fetchData()
  return (
    <div>
      <Header title="Admin" isLeader={true} />
      <Suspense fallback={<p className="px-4 text-gray-400 italic text-sm">Loading…</p>}>
        <RegroupWorkoutsForm variants={workoutVariants} />
      </Suspense>
    </div>
  )
}
