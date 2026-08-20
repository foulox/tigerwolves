import { notFound } from 'next/navigation'
import { fetchData, fetchRunGroups } from '@/lib/db'
import EditWorkoutForm from '@/components/EditWorkoutForm'

export default async function EditWorkoutPage({ searchParams }: { searchParams: Promise<{ variantId?: string }> }) {
  const { variantId } = await searchParams
  if (!variantId) notFound()

  const { workoutVariants } = await fetchData()
  const variant = workoutVariants.find(w => w.id === Number(variantId))
  if (!variant) notFound()

  const runGroups = await fetchRunGroups()
  return <EditWorkoutForm variant={variant} runGroups={runGroups} />
}
