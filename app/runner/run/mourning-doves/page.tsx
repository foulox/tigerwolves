'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { SERIES, DOVES_ROUTES, type DovesRoute } from '@/lib/demoRunnerData'

function RouteCard({ route, expanded, onToggle }: {
  route: DovesRoute; expanded: boolean; onToggle: () => void
}) {
  const s = SERIES.doves
  return (
    <button
      onClick={onToggle}
      className={`w-full text-left rounded-2xl border flex flex-col touch-manipulation ${route.isNext ? `bg-white ${s.border} shadow-sm` : 'bg-white border-gray-100'}`}
    >
      <div className="px-4 py-4">
        {route.isNext && (
          <div className="text-xs font-bold tracking-wide text-orange-500 mb-1">NEXT UP</div>
        )}
        <div className="flex justify-between items-start gap-3">
          <div className="min-w-0">
            <div className={`text-sm font-semibold ${route.isNext ? 'text-gray-500' : 'text-gray-400'}`}>
              {route.date}
            </div>
            <div className={`text-[16px] font-bold mt-0.5 ${route.isNext ? 'text-gray-900' : 'text-gray-700'}`}>
              {route.title}
            </div>
          </div>
          <span className={`text-xs font-semibold rounded-full px-2.5 py-1 whitespace-nowrap flex-none ${route.isNext ? `${s.pillBg} ${s.pillText}` : 'bg-gray-100 text-gray-500'}`}>
            {route.distance}
          </span>
        </div>
        <div className="flex justify-between items-center mt-2">
          <span className="text-sm text-gray-400">{route.leader}</span>
          <span className="text-[13px] font-semibold text-orange-600">
            {expanded ? 'Less ↑' : 'More ↓'}
          </span>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3.5 flex flex-col gap-2">
          <p className="text-sm leading-relaxed text-gray-700">{route.prose}</p>
          {route.stravaUrl && (
            <a
              href={route.stravaUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              className="text-xs font-semibold text-orange-600 underline"
            >
              View route on Strava →
            </a>
          )}
        </div>
      )}
    </button>
  )
}

export default function MourningDovesPage() {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const s = SERIES.doves

  const toggle = (i: number) => setExpanded((prev: Record<number, boolean>) => ({ ...prev, [i]: !prev[i] }))

  return (
    <div className="flex flex-col gap-0 pt-10">
      {/* Header */}
      <div className="px-4 pb-2 flex items-center gap-3">
        <Link href="/runner" aria-label="Back" className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-600 touch-manipulation">
          <ChevronLeft size={18} strokeWidth={2} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-[22px] font-extrabold tracking-tight truncate">{s.name}</h1>
          <p className="text-[13px] text-gray-400">{s.dayName.charAt(0) + s.dayName.slice(1).toLowerCase()}s · {s.time} · {s.place}</p>
        </div>
        <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 text-sm font-bold flex-none">
          🕊️
        </div>
      </div>

      {/* Run blurb */}
      <div className={`mx-4 mt-3 mb-4 rounded-2xl border px-4 py-3 ${s.border} ${s.tintBg}`}>
        <div className={`text-[11px] font-bold tracking-widest uppercase mb-1`} style={{ color: '#9333ea' }}>
          WEDNESDAYS
        </div>
        <p className="text-sm leading-relaxed text-gray-600">{s.blurb}</p>
        <p className="text-[12.5px] text-gray-400 mt-1.5">{s.leaders}</p>
      </div>

      {/* Upcoming routes */}
      <div className="px-4 flex flex-col gap-3">
        <div className="text-[11px] font-bold tracking-widest uppercase text-gray-400">
          Upcoming
        </div>
        {DOVES_ROUTES.map((route, i) => (
          <RouteCard
            key={i}
            route={route}
            expanded={!!expanded[i]}
            onToggle={() => toggle(i)}
          />
        ))}
      </div>
    </div>
  )
}
