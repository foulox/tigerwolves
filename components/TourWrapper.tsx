'use client'

import { useRef } from 'react'
import OnboardingTour, { type TourRef } from './OnboardingTour'
import HowToUseButton from './HowToUseButton'

export default function TourWrapper({ isLeader }: { isLeader: boolean }) {
  const tourRef = useRef<TourRef | null>(null)
  return (
    <>
      <OnboardingTour isLeader={isLeader} tourRef={tourRef} />
      <HowToUseButton tourRef={tourRef} />
    </>
  )
}
