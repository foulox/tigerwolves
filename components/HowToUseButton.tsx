'use client'

import type { TourRef } from './OnboardingTour'

const SEEN_KEY = 'tw_tour_seen'

export default function HowToUseButton({ tourRef }: { tourRef: React.RefObject<TourRef | null> }) {
  function handleClick() {
    localStorage.removeItem(SEEN_KEY)
    tourRef.current?.launch()
  }

  return (
    <button
      onClick={handleClick}
      className="text-xs text-gray-400 underline touch-manipulation"
    >
      How to use this
    </button>
  )
}
