'use client'

import { useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { VISITOR_STEPS, LEADER_STEPS } from '@/lib/tourSteps'

const SEEN_KEY = 'tw_tour_seen'

// Step index that needs the first schedule card auto-expanded before it can highlight.
const EXPAND_CARD_STEP = 1

// Step index that expands the first family card so a variation is visible once navigated.
const LIBRARY_VARIATIONS_STEP = 5

// Steps that live on a route other than the one the tour started on — single
// source of truth for both triggering the navigation and finding the target
// once the new page has rendered.
const NAV_STEPS: Record<number, { path: string; selector: string }> = {
  [LIBRARY_VARIATIONS_STEP]: { path: '/library', selector: '[data-tour="library-variations"]' },
  8: { path: '/', selector: '[data-tour="feedback"]' },
  11: { path: '/plan', selector: '[data-tour="heylo-area"]' },
  12: { path: '/library', selector: '[data-tour="library-manage"]' },
}

export type TourRef = { launch: () => void }

interface Props {
  isLeader: boolean
  tourRef?: React.RefObject<TourRef | null>
}

function waitForElement(selector: string, timeout = 3000): Promise<Element | null> {
  return new Promise(resolve => {
    const start = Date.now()
    function tick() {
      const el = document.querySelector(selector)
      if (el) return resolve(el)
      if (Date.now() - start > timeout) return resolve(null)
      requestAnimationFrame(tick)
    }
    tick()
  })
}

export default function OnboardingTour({ isLeader, tourRef }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const pathnameRef = useRef(pathname)
  const launched = useRef(false)
  const pendingStep = useRef<number | null>(null)

  useEffect(() => { pathnameRef.current = pathname }, [pathname])

  function getSteps() {
    return isLeader ? [...VISITOR_STEPS, ...LEADER_STEPS] : VISITOR_STEPS
  }

  async function launchTour(startAt = 0) {
    const { driver } = await import('driver.js')
    await import('driver.js/dist/driver.css')

    const driverObj = driver({
      showProgress: true,
      animate: true,
      overlayOpacity: 0.5,
      steps: getSteps(),
      onHighlightStarted: (_el, _step, { state }) => {
        const idx = state.activeIndex ?? 0

        // Expand first schedule card so the flag button (step 3) is in DOM
        if (idx === EXPAND_CARD_STEP) {
          const card = document.querySelector('[data-tour="schedule-detail"]')
          if (card && card.getAttribute('aria-expanded') !== 'true') {
            (card as HTMLElement).click()
          }
          return
        }

        // Navigate to the correct page for steps that live on other routes
        const nav = NAV_STEPS[idx]
        if (nav && pathnameRef.current !== nav.path) {
          pendingStep.current = idx
          router.push(nav.path)
          setTimeout(() => driverObj.destroy(), 0)
        }
      },
      onDestroyStarted: (_el, _step, { driver: d }) => {
        if (pendingStep.current === null) {
          localStorage.setItem(SEEN_KEY, '1')
        }
        d.destroy()
      },
    })

    driverObj.drive(startAt)
  }

  // After navigation completes, re-launch from the pending step
  useEffect(() => {
    if (pendingStep.current === null) return
    const step = pendingStep.current
    const nav = NAV_STEPS[step]

    if (!nav || pathname !== nav.path) return
    pendingStep.current = null

    waitForElement(nav.selector, 3000).then(el => {
      if (!el) return
      if (step === LIBRARY_VARIATIONS_STEP) {
        // Expand the first family card so a variation is visible when highlighted
        const btn = el.querySelector('button') as HTMLButtonElement | null
        btn?.click()
        setTimeout(() => launchTour(step), 100)
      } else {
        launchTour(step)
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps -- launchTour intentionally not listed; it's stable per render and captured correctly via the effect's closure
  }, [pathname])

  useEffect(() => {
    if (tourRef) {
      tourRef.current = { launch: () => launchTour(0) }
    }
    // Only the entry page auto-launches — a manual relaunch (which clears SEEN_KEY)
    // must not cause this effect to fire again on a later re-render, e.g. the
    // pathname change from a mid-tour navigation step.
    if (pathname === '/' && !launched.current && !localStorage.getItem(SEEN_KEY)) {
      launched.current = true
      const t = setTimeout(() => launchTour(0), 500)
      return () => clearTimeout(t)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount only, capturing the entry pathname; must not re-run on later pathname changes
  }, [])

  return null
}
