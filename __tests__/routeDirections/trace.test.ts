import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/strava/token', () => ({ getStravaAccessToken: vi.fn().mockResolvedValue('tok') }))

import { fetchStravaLatLng } from '@/lib/routeProviders/strava'
import { fetchMapMyRunLatLng } from '@/lib/routeProviders/mapmyrun'
import { fetchFullTrace } from '@/lib/routeDirections/trace'

describe('fetchStravaLatLng', () => {
  it('reads the latlng stream (full trace, not the coarse summary)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ([{ type: 'latlng', data: [[40.72, -73.95], [40.73, -73.96]] }]),
    }) as unknown as typeof fetch
    const pts = await fetchStravaLatLng('6647021', fetchImpl)
    expect(pts).toEqual([[40.72, -73.95], [40.73, -73.96]])
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('/routes/6647021/streams')
  })
  it('returns [] on a non-200', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch
    expect(await fetchStravaLatLng('1', fetchImpl)).toEqual([])
  })
})

describe('fetchMapMyRunLatLng', () => {
  it('extracts [lat,lng] from the embedded route points', async () => {
    const html = 'x window.__STATE__ = {"routes":{"route":{"points":[{"lat":40.72,"lng":-73.95},{"lat":40.73,"lng":-73.96}]}}} ;'
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, text: async () => html }) as unknown as typeof fetch
    const pts = await fetchMapMyRunLatLng('6167055370', fetchImpl)
    expect(pts).toEqual([[40.72, -73.95], [40.73, -73.96]])
  })
})

describe('fetchFullTrace', () => {
  beforeEach(() => vi.clearAllMocks())
  it('returns [] for an unsupported url', async () => {
    expect(await fetchFullTrace('https://example.com/x')).toEqual([])
  })
})
