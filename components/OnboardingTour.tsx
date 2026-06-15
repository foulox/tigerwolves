'use client'

import { useEffect, useRef } from 'react'
import { VISITOR_STEPS, LEADER_STEPS } from '@/lib/tourSteps'

const SEEN_KEY = 'tw_tour_seen'

export type TourRef = { launch: () => void }

interface Props {
  isLeader: boolean
  tourRef?: React.RefObject<TourRef | null>
}

export default function OnboardingTour({ isLeader, tourRef }: Props) {
  const launched = useRef(false)

  function getSteps() {
    return isLeader ? [...VISITOR_STEPS, ...LEADER_STEPS] : VISITOR_STEPS
  }

  async function launchTour() {
    const { driver } = await import('driver.js')
    await import('driver.js/dist/driver.css')
    const driverObj = driver({
      showProgress: true,
      animate: true,
      overlayOpacity: 0.5,
      steps: getSteps(),
      onDestroyStarted: () => {
        localStorage.setItem(SEEN_KEY, '1')
        driverObj.destroy()
      },
    })
    driverObj.drive()
  }

  useEffect(() => {
    if (tourRef) {
      tourRef.current = { launch: launchTour }
    }
    if (!launched.current && !localStorage.getItem(SEEN_KEY)) {
      launched.current = true
      const t = setTimeout(launchTour, 500)
      return () => clearTimeout(t)
    }
  })

  return null
}
