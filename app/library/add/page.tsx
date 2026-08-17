import { fetchData, fetchRunGroups } from '@/lib/db'
import AddWorkoutForm from '@/components/AddWorkoutForm'
import AddVariationForm from '@/components/AddVariationForm'

export default async function AddWorkoutPage({ searchParams }: { searchParams: Promise<{ parent?: string }> }) {
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
  return <AddWorkoutForm runGroups={runGroups} />
}
