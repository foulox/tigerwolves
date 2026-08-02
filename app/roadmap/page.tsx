import { auth } from '@clerk/nextjs/server'
import { fetchRoadmap } from '@/lib/roadmap'
import type { RoadmapCard, RoadmapStatus } from '@/lib/roadmap'
import Header from '@/components/Header'

const badgeStyles: Record<RoadmapStatus, string> = {
  live: 'text-orange-600 font-semibold text-xs uppercase tracking-wide',
  upcoming: 'text-gray-500 font-medium text-xs uppercase tracking-wide border border-gray-300 rounded-full px-2 py-0.5',
  vision: 'text-gray-400 italic text-xs uppercase tracking-wide',
}

const cardStyles: Record<RoadmapStatus, string> = {
  live: 'border border-orange-400 rounded-2xl p-4 bg-white',
  upcoming: 'border border-gray-200 rounded-2xl p-4 bg-white',
  vision: 'border border-dashed border-gray-300 rounded-2xl p-4 bg-white',
}

const titleStyles: Record<RoadmapStatus, string> = {
  live: 'font-bold text-gray-900',
  upcoming: 'font-bold text-gray-900',
  vision: 'font-bold italic text-gray-500',
}

const descStyles: Record<RoadmapStatus, string> = {
  live: 'text-sm text-gray-600 mt-1',
  upcoming: 'text-sm text-gray-500 mt-1',
  vision: 'text-sm text-gray-400 mt-1',
}

function RoadmapCardItem({ card }: { card: RoadmapCard }) {
  return (
    <div className={cardStyles[card.status]}>
      <div className="mb-2">
        {card.status === 'live' ? (
          <span className={badgeStyles.live}>
            <span className="inline-block w-2 h-2 rounded-full bg-orange-500 mr-1.5 align-middle" />
            Live now
          </span>
        ) : (
          <span className={badgeStyles[card.status]}>
            {card.status === 'vision' ? 'Vision' : 'Upcoming'}
          </span>
        )}
      </div>
      <h2 className={titleStyles[card.status]}>{card.title}</h2>
      <p className={descStyles[card.status]}>{card.description}</p>
    </div>
  )
}

export default async function RoadmapPage() {
  const { userId } = await auth()
  const cards = await fetchRoadmap()

  return (
    <div>
      <Header title="Roadmap" subtitle="Where TigerWolves is going" isLeader={!!userId} />

      <div className="px-4 pb-24 flex flex-col gap-3">
        {cards.length === 0 ? (
          <p className="text-gray-400 text-sm italic">Roadmap unavailable — check back soon.</p>
        ) : (
          cards.map((card, i) => <RoadmapCardItem key={i} card={card} />)
        )}
      </div>
    </div>
  )
}
