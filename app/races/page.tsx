import { auth } from '@clerk/nextjs/server'
import { fetchData } from '@/lib/db'
import { getRaceTallies } from '@/lib/raceTags'
import Header from '@/components/Header'
import RacesClient from '@/components/RacesClient'

export default async function RacesPage() {
  const { userId } = await auth()
  const { races } = await fetchData()
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = races.filter(r => r.date >= today)
  const tallies = await getRaceTallies(upcoming.map(r => r.id))

  return (
    <div>
      <Header
        title="Races"
        subtitle="Add a race, tag how much it matters, see who's building toward what"
        isLeader={!!userId}
      />

      <div className="px-4 pb-4">
        <RacesClient initialRaces={upcoming} initialTallies={tallies} isLeader={!!userId} />
      </div>
    </div>
  )
}
