'use client'

import { useRef } from 'react'
import OnboardingTour, { type TourRef } from './OnboardingTour'
import HowToUseButton from './HowToUseButton'
import WhatsNewOverlay from './WhatsNewOverlay'

export default function TourWrapper({ isLeader }: { isLeader: boolean }) {
  const tourRef = useRef<TourRef | null>(null)
  return (
    <>
      <OnboardingTour isLeader={isLeader} tourRef={tourRef} />
      <WhatsNewOverlay tourRef={tourRef} />
      <HowToUseButton tourRef={tourRef} />
    </>
  )
}
