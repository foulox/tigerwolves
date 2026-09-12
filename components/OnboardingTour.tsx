'use client'

import { useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { VISITOR_STEPS, LEADER_STEPS } from '@/lib/tourSteps'

const SEEN_KEY = 'tw_tour_seen'

// Step index that expands the first family card so a variation is visible once navigated.
// #332: was 5; the four schedule* steps collapsed into a single My Week step at index 0.
const LIBRARY_VARIATIONS_STEP = 2

// driver.js tears down and repositions the popover on every step transition. A tap that
// lands in that gap (on the overlay, or on the outgoing/incoming highlighted element)
// is a mistimed repeat tap, not a deliberate exit — ignore clicks for a beat after each
// transition. Matches driver.js's own transition duration.
const STEP_TRANSITION_GRACE_MS = 400

// Steps that live on a route other than the one the tour started on — single
// source of truth for both triggering the navigation and finding the target
// once the new page has rendered.
// #332 indices after the schedule* steps collapsed to one My Week step at 0:
// visitor 0 my-week · 1 library · 2 library-variations · 3 races · 4 roadmap ·
// 5 feedback · 6 how-to-use, then leader 7 plan · 8 heylo-area · 9 library-manage.
// feedback/how-to-use live in the Header (present on every page), so they need no
// nav entry — they highlight in place on whatever page the tour is already on.
const NAV_STEPS: Record<number, { path: string; selector: string }> = {
  [LIBRARY_VARIATIONS_STEP]: { path: '/library', selector: '[data-tour="library-variations"]' },
  8: { path: '/plan', selector: '[data-tour="heylo-area"]' },
  9: { path: '/library', selector: '[data-tour="library-manage"]' },
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
  const pendingStep = useRef<number | null>(null)
  const lastHighlightAt = useRef(0)
  const activeDriverRef = useRef<{ destroy: () => void } | null>(null)

  useEffect(() => { pathnameRef.current = pathname }, [pathname])

  useEffect(() => () => { activeDriverRef.current?.destroy() }, [])

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
      // driver.js only offers a hook for clicks on the overlay backdrop — clicking the
      // highlighted element itself is left natively interactive with no hook at all. Disable
      // driver.js's own overlay handling entirely and decide everything ourselves via a single
      // document-level listener below, so both cases (backdrop and highlighted element) go
      // through the same "anything but Next/Previous exits" rule.
      overlayClickBehavior: () => {},
      onHighlightStarted: (_el, _step, { state }) => {
        lastHighlightAt.current = Date.now()
        const idx = state.activeIndex ?? 0

        // Navigate to the correct page for steps that live on other routes
        const nav = NAV_STEPS[idx]
        if (nav && pathnameRef.current !== nav.path) {
          pendingStep.current = idx
          router.push(nav.path)
          setTimeout(() => driverObj.destroy(), 0)
        }
      },
      onDestroyStarted: (_el, _step, { driver: d }) => {
        activeDriverRef.current = null
        document.removeEventListener('click', handleOutsideClick, true)
        if (pendingStep.current === null) {
          localStorage.setItem(SEEN_KEY, '1')
        }
        d.destroy()
      },
    })
    activeDriverRef.current = driverObj

    // Next and Previous keep their normal behavior; a click anywhere else — including on
    // the highlighted element, which driver.js otherwise leaves fully interactive — exits
    // the tour and lets the click's own native behavior (e.g. a real nav) proceed untouched.
    function handleOutsideClick(e: MouseEvent) {
      if (Date.now() - lastHighlightAt.current < STEP_TRANSITION_GRACE_MS) return
      const target = e.target instanceof Element ? e.target : null
      if (target?.closest('.driver-popover-next-btn, .driver-popover-prev-btn')) return
      driverObj.destroy()
    }
    document.addEventListener('click', handleOutsideClick, true)

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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- launchTour intentionally not listed; it's stable per render and captured correctly via the effect's closure
  }, [tourRef])

  return null
}
