import { PostHog } from 'posthog-node'
import { POSTHOG_KEY, POSTHOG_HOST } from './posthogEnv'

let posthogClient: PostHog | null | undefined

function getClient(): PostHog | null {
  if (posthogClient !== undefined) return posthogClient
  posthogClient = POSTHOG_KEY ? new PostHog(POSTHOG_KEY, { host: POSTHOG_HOST }) : null
  return posthogClient
}

// Analytics must never break a user-facing action. If PostHog is slow or
// unreachable, swallow the error rather than let it block the caller's redirect.
export async function captureServerEvent(
  event: string,
  distinctId: string,
  properties?: Record<string, string | number | boolean>
): Promise<void> {
  const client = getClient()
  if (!client) return
  try {
    client.capture({ distinctId, event, properties })
    await client.flush()
  } catch {
    // Best-effort only - a PostHog outage should never surface as an app error.
  }
}
