import posthog from 'posthog-js'

// Names are doubled (NEXT_PUBLIC_NEXT_PUBLIC_POSTHOG_POSTHOG_...) because the Vercel Marketplace
// integration's own variable names already started with NEXT_PUBLIC_POSTHOG_, and our custom
// prefix got prepended on top rather than replacing it. Cosmetic only - left as provisioned.
const POSTHOG_KEY = process.env.NEXT_PUBLIC_NEXT_PUBLIC_POSTHOG_POSTHOG_PROJECT_TOKEN
const POSTHOG_HOST = process.env.NEXT_PUBLIC_NEXT_PUBLIC_POSTHOG_POSTHOG_HOST

let initialized = false

const VISITED_KEY = 'tw_visited'

export function initAnalytics(isLeader: boolean) {
  if (initialized) return
  if (!POSTHOG_KEY) return

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST ?? 'https://us.i.posthog.com',
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
