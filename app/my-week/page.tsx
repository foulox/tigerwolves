import { fetchData } from '@/lib/sheets'
import MyWeekClient from '@/components/MyWeekClient'

export default async function MyWeekPage() {
  const { schedule, workouts } = await fetchData()
  const today = new Date().toISOString().slice(0, 10)

  const upcoming = schedule
    .filter(e => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))

  return <MyWeekClient upcoming={upcoming} workouts={workouts} />
}
