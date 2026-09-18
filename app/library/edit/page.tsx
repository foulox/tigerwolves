import { notFound } from 'next/navigation'
import { fetchData, getLeaderRunGroups, fetchRunGroups } from '@/lib/db'
import EditWorkoutForm from '@/components/EditWorkoutForm'
import { requireLeaderPage } from '@/lib/requireLeaderPage'
import type { RunGroup } from '@/lib/data'

export default async function EditWorkoutPage({ searchParams }: { searchParams: Promise<{ variantId?: string }> }) {
  const user = await requireLeaderPage() // #337: route-level leader gate runs before notFound()/any load
  const { variantId } = await searchParams
  if (!variantId) notFound()

  const { workoutVariants } = await fetchData()
  const variant = workoutVariants.find(w => w.id === Number(variantId))
  if (!variant) notFound()

  // #401 (Story A): owner options are the groups this leader is authorized for.
  // The workout's CURRENT owner is prepended (if not already authorized) so editing
  // a workout owned by another group never silently reassigns it — but no unrelated
  // group is ever offered as a NEW target (the 96fcb3e guard).
  const authorizedGroups = await getLeaderRunGroups(user.id)
  let groupOptions: RunGroup[] = authorizedGroups
  if (variant.runGroupId != null && !authorizedGroups.some(g => g.id === variant.runGroupId)) {
    const owner = (await fetchRunGroups()).find(g => g.id === variant.runGroupId)
    if (owner) groupOptions = [owner, ...authorizedGroups]
  }

  return <EditWorkoutForm variant={variant} groupOptions={groupOptions} />
}
