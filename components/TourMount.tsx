'use client'

import { useRef, useEffect } from 'react'
import OnboardingTour, { type TourRef } from './OnboardingTour'

const SEEN_KEY = 'tw_tour_seen'

export default function TourMount({ isLeader }: { isLeader: boolean }) {
  const tourRef = useRef<TourRef | null>(null)

  useEffect(() => {
    function handleLaunch() {
      localStorage.removeItem(SEEN_KEY)
      tourRef.current?.launch()
    }
    document.addEventListener('tw:launch-tour', handleLaunch)
    return () => document.removeEventListener('tw:launch-tour', handleLaunch)
  }, [])

  return <OnboardingTour isLeader={isLeader} tourRef={tourRef} />
}
