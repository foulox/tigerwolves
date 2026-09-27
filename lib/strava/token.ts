import { kv } from '@vercel/kv'

export const STRAVA_TOKEN_KEY = 'strava:access_token'
export const STRAVA_TOKEN_SKEW_MS = 60_000

type CachedToken = { accessToken: string; expiresAt: number } // expiresAt is ms epoch

async function refresh(): Promise<CachedToken> {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: process.env.STRAVA_REFRESH_TOKEN,
    }),
  })
  if (!res.ok) throw new Error(`Strava token refresh failed: ${res.status}`)
  const data = (await res.json()) as { access_token: string; expires_at: number }
  const token: CachedToken = { accessToken: data.access_token, expiresAt: data.expires_at * 1000 }
  await kv.set(STRAVA_TOKEN_KEY, token)
  return token
}

export async function getStravaAccessToken(): Promise<string> {
  let cached: CachedToken | null = null
  try {
    cached = await kv.get<CachedToken>(STRAVA_TOKEN_KEY)
  } catch {
    cached = null // KV outage: fall through to a refresh
  }
  if (cached && cached.expiresAt - STRAVA_TOKEN_SKEW_MS > Date.now()) {
    return cached.accessToken
  }
  const refreshed = await refresh()
  return refreshed.accessToken
}
