import { redirect } from 'next/navigation'
import { fetchData } from '@/lib/sheets'
import EditWorkoutForm from '@/components/EditWorkoutForm'

export default async function EditWorkoutPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; variation?: string }>
}) {
  const { name, variation } = await searchParams
  if (!name) redirect('/library')

  const { workouts } = await fetchData()
  const workout = workouts.find(w =>
    w.name === name &&
    (variation !== undefined ? w.variation === variation : !w.variation)
  )
  if (!workout) redirect('/library')

  return <EditWorkoutForm workout={workout} />
}
