import { PostHog } from 'posthog-node'

// Names are doubled (NEXT_PUBLIC_NEXT_PUBLIC_POSTHOG_POSTHOG_...) because the Vercel Marketplace
// integration's own variable names already started with NEXT_PUBLIC_POSTHOG_, and our custom
// prefix got prepended on top rather than replacing it. Cosmetic only - left as provisioned.
const POSTHOG_KEY = process.env.NEXT_PUBLIC_NEXT_PUBLIC_POSTHOG_POSTHOG_PROJECT_TOKEN
const POSTHOG_HOST = process.env.NEXT_PUBLIC_NEXT_PUBLIC_POSTHOG_POSTHOG_HOST

let posthogClient: PostHog | null | undefined

function getClient(): PostHog | null {
  if (posthogClient !== undefined) return posthogClient
  posthogClient = POSTHOG_KEY
    ? new PostHog(POSTHOG_KEY, { host: POSTHOG_HOST ?? 'https://us.i.posthog.com' })
    : null
  return posthogClient
}

export async function captureServerEvent(
  event: string,
  properties?: Record<string, string | number | boolean>
): Promise<void> {
  const client = getClient()
  if (!client) return
  client.capture({ distinctId: 'server-actions', event, properties: { ...properties, isLeader: true } })
  await client.flush()
}
