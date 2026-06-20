'use client'

import { useEffect, useState, useRef } from 'react'
import { CURRENT_VERSION, WHATS_NEW } from '@/lib/whatsNew'
import type { TourRef } from './OnboardingTour'

const VERSION_KEY = 'tw_version'
const SEEN_KEY = 'tw_tour_seen'

interface Props {
  tourRef: React.RefObject<TourRef | null>
}

export default function WhatsNewOverlay({ tourRef }: Props) {
  const [open, setOpen] = useState(false)
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    const storedVersion = localStorage.getItem(VERSION_KEY)
    const tourSeen = localStorage.getItem(SEEN_KEY)

    if (!storedVersion && !tourSeen) return

    const stored = storedVersion ? Number(storedVersion) : 0
    if (stored < CURRENT_VERSION) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading localStorage on mount to show overlay; no external subscription, safe to setState synchronously
      setOpen(true)
    }
  }, [])

  function dismiss() {
    localStorage.setItem(VERSION_KEY, String(CURRENT_VERSION))
    setOpen(false)
  }

  function openOverlay() {
    setOpen(true)
  }

  if (!open) {
    return (
      <button
        onClick={openOverlay}
        className="text-xs text-gray-400 underline touch-manipulation"
        data-whats-new-trigger
      >
        What&apos;s New
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-1">What&apos;s New</h2>
        <p className="text-xs text-gray-400 mb-4">Recent updates to TigerWolves</p>
        <ul className="space-y-3 mb-6">
          {WHATS_NEW.map((item, i) => (
            <li key={i}>
              <p className="text-sm font-semibold text-gray-800">{item.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2">
          <button
            onClick={dismiss}
            className="w-full py-3 rounded-xl bg-orange-500 text-white font-semibold text-sm touch-manipulation"
          >
            Got it
          </button>
          <button
            onClick={() => {
              dismiss()
              tourRef.current?.launch()
            }}
            className="w-full py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm touch-manipulation"
          >
            See full tour
          </button>
        </div>
      </div>
    </div>
  )
}
