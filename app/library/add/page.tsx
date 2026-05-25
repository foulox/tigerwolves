import { fetchData } from '@/lib/sheets'
import AddWorkoutForm from '@/components/AddWorkoutForm'
import AddVariationForm from '@/components/AddVariationForm'

export default async function AddWorkoutPage({ searchParams }: { searchParams: Promise<{ parent?: string }> }) {
  const { parent } = await searchParams

  if (parent) {
    const { workouts } = await fetchData()
    const members = workouts.filter(w => w.name === parent)
    const base = members.find(w => !w.variation) ?? members[0]
    if (base) {
      const variations = members.filter(w => w.variation).sort((a, b) => (a.progression ?? 0) - (b.progression ?? 0))
      const maxProgression = members.reduce((max, w) => Math.max(max, w.progression ?? 0), 0)
      return <AddVariationForm parent={base} siblings={variations} nextProgression={maxProgression + 1} />
    }
  }

  return <AddWorkoutForm />
}
