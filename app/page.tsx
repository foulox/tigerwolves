import Link from 'next/link'
import { fetchData } from '@/lib/sheets'

const TYPE_COLORS: Record<string, string> = {
  Hills: 'bg-green-100 text-green-800',
  'Broken Tempo': 'bg-blue-100 text-blue-800',
  Progression: 'bg-purple-100 text-purple-800',
  Ladder: 'bg-orange-100 text-orange-800',
  Superset: 'bg-red-100 text-red-800',
  'Straight Tempo': 'bg-yellow-100 text-yellow-800',
  Threshold: 'bg-pink-100 text-pink-800',
}

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

export default async function SchedulePage() {
  const { schedule } = await fetchData()
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = schedule.filter(e => e.date >= today)

  return (
    <div>
      <header className="px-4 pt-10 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>
        <p className="text-sm text-gray-500 mt-0.5">Upcoming Tuesdays</p>
      </header>

      <div className="px-4 flex flex-col gap-3">
        {upcoming.length === 0 && (
          <p className="text-gray-400 italic text-sm">No upcoming workouts scheduled yet.</p>
        )}
        {upcoming.map((entry, i) => (
          <Link
            key={entry.date}
            href={`/my-week?week=${i}`}
            className={`block bg-white rounded-2xl p-4 shadow-sm border active:bg-gray-50 touch-manipulation ${i === 0 ? 'border-orange-300' : 'border-gray-100'}`}
          >
            {i === 0 && <div className="text-xs font-bold text-orange-500 tracking-wide mb-1">NEXT UP</div>}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-500">{formatDate(entry.date)}</div>
                <div className="text-base font-bold text-gray-900 mt-0.5 truncate">
                  {entry.workoutName ?? <span className="text-gray-400 font-normal italic">Not planned yet</span>}
                </div>
                <div className="text-sm text-gray-500 mt-0.5">Led by {entry.leader}</div>
              </div>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap shrink-0 ${TYPE_COLORS[entry.workoutType] ?? 'bg-gray-100 text-gray-600'}`}>
                {entry.workoutType}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
