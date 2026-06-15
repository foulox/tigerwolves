import { auth } from '@clerk/nextjs/server'
import { fetchData } from '@/lib/sheets'
import PlanClient from '@/components/PlanClient'

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { userId } = await auth()
  const { schedule, workouts } = await fetchData()
  const today = new Date().toISOString().slice(0, 10)

  const upcoming = schedule
    .filter(e => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))

  const { week } = await searchParams
  const initialWeekIndex = Math.min(Math.max(parseInt(week ?? '0', 10) || 0, 0), upcoming.length - 1)

  return <PlanClient upcoming={upcoming} workouts={workouts} initialWeekIndex={initialWeekIndex} isLeader={!!userId} />
}
