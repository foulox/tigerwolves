import { fetchData } from '@/lib/sheets'

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'long', day: 'numeric', year: 'numeric',
  })
}

function daysUntil(iso: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((new Date(iso + 'T00:00:00').getTime() - today.getTime()) / 86400000)
}

export default async function RacesPage() {
  const { races } = await fetchData()
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = races.filter(r => r.date >= today)

  return (
    <div className="px-4 pt-10 pb-4">
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Races</h1>
        <p className="text-sm text-gray-500 mt-0.5">Plan your training around these</p>
      </header>

      <div className="flex flex-col gap-3">
        {upcoming.length === 0 && (
          <p className="text-gray-400 italic text-sm">No upcoming races added yet.</p>
        )}
        {upcoming.map(race => {
          const days = daysUntil(race.date)
          return (
            <div key={race.date + race.name} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <div className="flex justify-between items-start gap-3">
                <div className="font-bold text-gray-900">{race.name}</div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${days <= 30 ? 'bg-red-100 text-red-700' : 'bg-blue-50 text-blue-600'}`}>
                  {days}d
                </span>
              </div>
              <div className="text-sm text-gray-500 mt-1">{formatDate(race.date)}</div>
              <div className="flex gap-2 mt-1.5 text-xs text-gray-400">
                <span>{race.distance}</span>
                <span>·</span>
                <span>{race.location}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
