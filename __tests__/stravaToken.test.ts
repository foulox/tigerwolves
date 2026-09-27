import { describe, it, expect, vi, beforeEach } from 'vitest'

const kvGet = vi.fn()
const kvSet = vi.fn()
vi.mock('@vercel/kv', () => ({ kv: { get: (...a: unknown[]) => kvGet(...a), set: (...a: unknown[]) => kvSet(...a) } }))

import { getStravaAccessToken, STRAVA_TOKEN_KEY } from '@/lib/strava/token'

describe('getStravaAccessToken', () => {
  beforeEach(() => {
    kvGet.mockReset(); kvSet.mockReset(); vi.unstubAllGlobals(); vi.useRealTimers()
    process.env.STRAVA_CLIENT_ID = 'cid'
    process.env.STRAVA_CLIENT_SECRET = 'secret'
    process.env.STRAVA_REFRESH_TOKEN = 'refresh'
  })

  it('returns the cached token when it is not near expiry (cache hit, no refresh)', async () => {
    kvGet.mockResolvedValue({ accessToken: 'cached-tok', expiresAt: Date.now() + 3_600_000 })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const tok = await getStravaAccessToken()
    expect(tok).toBe('cached-tok')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refreshes when the cached token is expired (or within the skew window)', async () => {
    kvGet.mockResolvedValue({ accessToken: 'old-tok', expiresAt: Date.now() + 10_000 }) // within 60s skew
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'new-tok', expires_at: Math.floor(Date.now() / 1000) + 21600 }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const tok = await getStravaAccessToken()
    expect(tok).toBe('new-tok')
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('https://www.strava.com/oauth/token')
    const body = JSON.parse((opts as RequestInit).body as string)
    expect(body).toMatchObject({ client_id: 'cid', client_secret: 'secret', grant_type: 'refresh_token', refresh_token: 'refresh' })
    // caches the refreshed token with a ms-epoch expiry derived from expires_at (seconds)
    expect(kvSet).toHaveBeenCalledWith(STRAVA_TOKEN_KEY, expect.objectContaining({ accessToken: 'new-tok' }))
  })

  it('refreshes when there is no cached token at all (cache miss)', async () => {
    kvGet.mockResolvedValue(null)
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'fresh-tok', expires_at: Math.floor(Date.now() / 1000) + 21600 }),
    })
    vi.stubGlobal('fetch', fetchMock)
    expect(await getStravaAccessToken()).toBe('fresh-tok')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('throws when the refresh call fails (non-ok)', async () => {
    kvGet.mockResolvedValue(null)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'bad' }))
    await expect(getStravaAccessToken()).rejects.toThrow()
  })
})
