import posthog from 'posthog-js'
import { POSTHOG_KEY, POSTHOG_HOST } from './posthogEnv'

let initialized = false

const VISITED_KEY = 'tw_visited'

export function initAnalytics(isLeader: boolean) {
  if (!POSTHOG_KEY) return

  if (!initialized) {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      person_profiles: 'identified_only',
      capture_pageview: true,
    })
    initialized = true
  }

  // Re-registered on every call (e.g. after sign-in changes isLeader) so the
  // super-property never gets stuck at whatever it was on first init.
  posthog.register({ isLeader })

  if (!isLeader && !hasVisitedBefore()) {
    posthog.capture('runner_joined')
  }
}

function hasVisitedBefore(): boolean {
  try {
    if (localStorage.getItem(VISITED_KEY)) return true
    localStorage.setItem(VISITED_KEY, '1')
    return false
  } catch {
    // localStorage can throw in some privacy-mode configurations - treat as
    // "can't tell", so we don't capture runner_joined rather than risk an
    // uncaught error inside the init effect.
    return true
  }
}

export function captureClientEvent(event: string, properties?: Record<string, string | number | boolean>) {
  if (!initialized) return
  posthog.capture(event, properties)
}
