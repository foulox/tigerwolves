import posthog from 'posthog-js'

let initialized = false

const VISITED_KEY = 'tw_visited'

export function initAnalytics(isLeader: boolean) {
  if (initialized) return
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (!key) return

  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
    person_profiles: 'identified_only',
    capture_pageview: true,
  })
  initialized = true
  posthog.register({ isLeader })

  if (!isLeader && !localStorage.getItem(VISITED_KEY)) {
    localStorage.setItem(VISITED_KEY, '1')
    posthog.capture('runner_joined')
  }
}

export function captureClientEvent(event: string, properties?: Record<string, string | number | boolean>) {
  if (!initialized) return
  posthog.capture(event, properties)
}
