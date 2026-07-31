import { auth } from '@clerk/nextjs/server'
import { fetchData } from '@/lib/db'
import { getRaceTallies } from '@/lib/raceTags'
import LeaderBadge from '@/components/LeaderBadge'
import RacesClient from '@/components/RacesClient'

export default async function RacesPage() {
  const { userId } = await auth()
  const { races } = await fetchData()
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = races.filter(r => r.date >= today)
  const tallies = await getRaceTallies(upcoming.map(r => r.id))

  return (
    <div className="relative px-4 pt-10 pb-4">
      <LeaderBadge isLeader={!!userId} />
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Races</h1>
        <p className="text-sm text-gray-500 mt-0.5">Add a race, tag how much it matters, see who&apos;s building toward what</p>
      </header>

      <RacesClient initialRaces={upcoming} initialTallies={tallies} isLeader={!!userId} />
    </div>
  )
}
