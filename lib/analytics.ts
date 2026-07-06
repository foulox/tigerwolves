import { PostHog } from 'posthog-node'

let posthogClient: PostHog | null | undefined

function getClient(): PostHog | null {
  if (posthogClient !== undefined) return posthogClient
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  posthogClient = key
    ? new PostHog(key, { host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com' })
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
