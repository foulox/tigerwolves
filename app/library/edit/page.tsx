import { notFound } from 'next/navigation'
import { fetchData } from '@/lib/sheets'
import EditWorkoutForm from '@/components/EditWorkoutForm'

export default async function EditWorkoutPage({ searchParams }: { searchParams: Promise<{ name?: string; variation?: string }> }) {
  const { name, variation = '' } = await searchParams
  if (!name) notFound()

  const { workouts } = await fetchData()
  const workout = workouts.find(w => w.name === name && w.variation === variation)
  if (!workout) notFound()

  return <EditWorkoutForm workout={workout} />
}
