import { notFound } from 'next/navigation'
import { fetchData } from '@/lib/db'
import EditWorkoutForm from '@/components/EditWorkoutForm'
import { requireLeaderPage } from '@/lib/requireLeaderPage'

export default async function EditWorkoutPage({ searchParams }: { searchParams: Promise<{ variantId?: string }> }) {
  await requireLeaderPage() // #337: route-level leader gate runs before notFound()/any load
  const { variantId } = await searchParams
  if (!variantId) notFound()

  const { workoutVariants } = await fetchData()
  const variant = workoutVariants.find(w => w.id === Number(variantId))
  if (!variant) notFound()

  return <EditWorkoutForm variant={variant} />
}
