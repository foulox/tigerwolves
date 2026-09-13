import { fetchData, fetchRunGroups } from '@/lib/db'
import AddWorkoutForm from '@/components/AddWorkoutForm'
import AddVariationForm from '@/components/AddVariationForm'
import { requireLeaderPage } from '@/lib/requireLeaderPage'

export default async function AddWorkoutPage({ searchParams }: { searchParams: Promise<{ parent?: string }> }) {
  await requireLeaderPage() // #337: route-level leader gate in front of the write actions
  const { parent } = await searchParams

  if (parent) {
    const { workoutVariants } = await fetchData()
    const familyId = Number(parent)
    const members = workoutVariants.filter(w => w.familyId === familyId)
    const base = members.find(w => w.label === null) ?? members[0]
    if (base) {
      const variations = members.filter(w => w.label !== null).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      const maxSortOrder = members.reduce((max, w) => Math.max(max, w.sortOrder ?? 0), 0)
      return <AddVariationForm parent={base} siblings={variations} nextSortOrder={maxSortOrder + 1} />
    }
  }

  const runGroups = await fetchRunGroups()
  // #354: the existing shared-catalog families, so the form can catch a
  // duplicate name before creating a second family and offer to add a variation
  // to the existing one instead. Deduped by familyId (one entry per family).
  const { workoutVariants } = await fetchData()
  const existingFamilies = Array.from(
    new Map(workoutVariants.map(w => [w.familyId, w.name])).entries(),
  ).map(([familyId, name]) => ({ familyId, name }))
  return <AddWorkoutForm runGroups={runGroups} existingFamilies={existingFamilies} />
}
