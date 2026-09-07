'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import {
  SERIES, DEFAULT_JOINED, RUNNER_JOINED_KEY, DAY_ORDER, DAY_LABEL,
  type RunId, type RunSeries,
} from '@/lib/demoRunnerData'

// Confirmation sheet for joining Hellkatz
function JoinSheet({ onConfirm, onDismiss }: { onConfirm: () => void; onDismiss: () => void }) {
  const s = SERIES.hellkatz
  return (
    <div
      className="fixed inset-0 bg-black/40 flex flex-col justify-end z-50"
      onClick={onDismiss}
    >
      <div
        className="bg-white rounded-t-3xl px-5 pb-8 pt-3 flex flex-col gap-4 animate-[slideUp_220ms_ease-out] max-h-[85vh] overflow-y-auto"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="w-11 h-1.5 rounded-full bg-gray-200 self-center" />
        <div className="flex flex-col gap-1.5">
          <h2 className="text-[22px] font-extrabold tracking-tight">Join the Helkatz Train</h2>
          <p className="text-sm leading-relaxed text-gray-600">
            Their Thursday workout shows up in your week alongside your other runs. You can leave any time.
          </p>
        </div>
        <div className="bg-gray-50 border border-gray-100 rounded-2xl p-3.5 flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <span className="text-[13px] text-gray-500">Meets</span>
            <span className="text-[13.5px] font-bold text-gray-900">Thursdays · {s.time}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[13px] text-gray-500">Start</span>
            <span className="text-[13.5px] font-bold text-gray-900">{s.place}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[13px] text-gray-500">This week</span>
            <span className="text-[13.5px] font-bold text-gray-900">Track session · {s.distance}</span>
          </div>
        </div>
        <div className="flex flex-col gap-2.5">
          <button
            onClick={onConfirm}
            className="w-full bg-orange-500 text-white rounded-2xl py-3.5 text-[15px] font-bold shadow-orange-200 shadow-md touch-manipulation"
          >
            Join the Helkatz Train
          </button>
          <button
            onClick={onDismiss}
            className="w-full text-[13px] font-semibold text-gray-400 py-2 touch-manipulation"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AllRunsPage() {
  const router = useRouter()
  const [joined, setJoined] = useState<RunId[]>(DEFAULT_JOINED)
  const [showSheet, setShowSheet] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(RUNNER_JOINED_KEY)
      if (stored) setJoined(JSON.parse(stored))
    } catch { /* ignore */ }
  }, [])

  const handleJoin = () => {
    const next: RunId[] = [...new Set([...joined, 'hellkatz' as RunId])]
    setJoined(next)
    try { localStorage.setItem(RUNNER_JOINED_KEY, JSON.stringify(next)) } catch { /* ignore */ }
    setShowSheet(false)
    router.push('/runner')
  }

  const hellkatzJoined = joined.includes('hellkatz')

  // Build ordered run list: your runs in day order, then Hellkatz if not joined
  const yourRuns = DAY_ORDER
    .map(day => Object.values(SERIES).find(s => s.day === day && joined.includes(s.id)))
    .filter((s): s is RunSeries => !!s)

  return (
    <>
      <div className="flex flex-col gap-0 pt-10">
        {/* Header */}
        <div className="px-4 pb-4 flex justify-between items-start">
          <div>
            <h1 className="text-[26px] font-extrabold tracking-tight">My Runs</h1>
            <p className="text-[13px] text-gray-400 mt-0.5">North Brooklyn Runners</p>
          </div>
          <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-sm font-bold">
            C
          </div>
        </div>

        <div className="px-4 flex flex-col gap-5">

          {/* YOUR RUNS */}
          <div className="flex flex-col gap-2">
            <div className="text-[11px] font-bold tracking-widest uppercase text-gray-400">
              Your Runs
            </div>
            {yourRuns.map(series => {
              const href = series.id === 'tigerwolves' ? '/' : series.id === 'doves' ? '/runner/run/mourning-doves' : null
              const cls = "bg-white border border-gray-100 rounded-2xl px-4 py-3.5 flex gap-3 items-center touch-manipulation"
              const inner = (
                <>
                  <span className={`w-1 self-stretch min-h-[32px] rounded-full flex-none ${series.bar}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[15.5px] font-bold text-gray-900">{series.name}</div>
                    <div className="text-[13px] text-gray-400">{DAY_LABEL[series.day]}s · {series.time}</div>
                  </div>
                  <span className="text-xs font-bold text-green-700 bg-green-100 rounded-full px-2.5 py-1 flex items-center gap-1">
                    <Check size={11} strokeWidth={3} />
                    Joined
                  </span>
                </>
              )
              return href
                ? <Link key={series.id} href={href} className={cls}>{inner}</Link>
                : <div key={series.id} className={cls}>{inner}</div>
            })}
            {/* Hellkatz joined state */}
            {hellkatzJoined && (
              <div className="bg-white border border-sky-200 rounded-2xl px-4 py-3.5 flex gap-3 items-center">
                <span className="w-1 self-stretch min-h-[32px] rounded-full flex-none bg-sky-500" />
                <div className="flex-1 min-w-0">
                  <div className="text-[15.5px] font-bold text-gray-900">{SERIES.hellkatz.name}</div>
                  <div className="text-[13px] text-gray-400">Thursdays · {SERIES.hellkatz.time}</div>
                </div>
                <span className="text-xs font-bold text-sky-700 bg-sky-100 rounded-full px-2.5 py-1 flex items-center gap-1">
                  <Check size={11} strokeWidth={3} />
                  Joined
                </span>
              </div>
            )}
          </div>

          {/* AVAILABLE — Hellkatz (only when not joined) */}
          {!hellkatzJoined && (
            <div className="flex flex-col gap-2">
              <div className="text-[11px] font-bold tracking-widest uppercase text-gray-400">
                Available near you
              </div>
              <button
                data-testid="run-card-hellkatz"
                onClick={() => setShowSheet(true)}
                className="w-full text-left bg-white border border-gray-100 rounded-2xl px-4 py-3.5 flex justify-between items-center gap-3 touch-manipulation"
              >
                <div>
                  <div className="text-[15.5px] font-bold text-gray-900">{SERIES.hellkatz.name}</div>
                  <div className="text-[13px] text-gray-400">Thursdays · 6:45am · McCarren Track</div>
                  <div className="text-[12.5px] text-gray-300 mt-0.5">Track workouts</div>
                </div>
                <span className="text-[13px] font-bold text-white bg-orange-500 rounded-full px-4 py-2 whitespace-nowrap shadow-sm touch-manipulation">
                  Join
                </span>
              </button>

              {/* Your run goes here pitch */}
              <div className="border-2 border-dashed border-gray-200 rounded-2xl px-4 py-5 flex flex-col gap-1 items-center text-center">
                <div className="text-[14.5px] font-bold text-gray-400">Your run goes here</div>
                <div className="text-[12.5px] text-gray-300 max-w-[250px]">
                  Every runner who joins sees your run in this same week view.
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {showSheet && (
        <JoinSheet onConfirm={handleJoin} onDismiss={() => setShowSheet(false)} />
      )}
    </>
  )
}
