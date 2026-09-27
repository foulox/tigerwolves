import { describe, it, expect, vi, beforeEach } from 'vitest'

const currentUser = vi.fn()
vi.mock('@clerk/nextjs/server', () => ({ currentUser: () => currentUser() }))
const providerFor = vi.fn()
vi.mock('@/lib/routeProviders/registry', () => ({ providerFor: (u: string) => providerFor(u) }))
const captureException = vi.fn()
vi.mock('@sentry/nextjs', () => ({ captureException: (...a: unknown[]) => captureException(...a) }))

import { POST } from '@/app/api/route/enrich/route'

function req(body: unknown) {
  return new Request('http://localhost/api/route/enrich', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}

describe('POST /api/route/enrich', () => {
  beforeEach(() => { currentUser.mockReset(); providerFor.mockReset(); captureException.mockReset() })

  it('401s a non-leader', async () => {
    currentUser.mockResolvedValue({ publicMetadata: { role: 'runner' } })
    const res = await POST(req({ url: 'https://www.strava.com/routes/1' }))
    expect(res.status).toBe(401)
  })

  it('returns enriched fields when a provider matches and fetch succeeds', async () => {
    currentUser.mockResolvedValue({ publicMetadata: { role: 'leader' } })
    providerFor.mockReturnValue({ id: 'strava', fetch: vi.fn().mockResolvedValue({ distanceMiles: 10, elevationFeet: 328, geometry: { summaryPolyline: 'p' }, name: 'Loop' }) })
    const res = await POST(req({ url: 'https://www.strava.com/routes/6647021' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ enriched: true, provider: 'strava', distanceMiles: 10, elevationFeet: 328, geometry: { summaryPolyline: 'p' }, name: 'Loop' })
  })

  it('returns { enriched: false } (200) when no provider matches', async () => {
    currentUser.mockResolvedValue({ publicMetadata: { role: 'leader' } })
    providerFor.mockReturnValue(null)
    const res = await POST(req({ url: 'https://mapmyrun.com/x' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ enriched: false })
  })

  it('returns { enriched: false } (200) when the provider fetch returns null (private/failed)', async () => {
    currentUser.mockResolvedValue({ publicMetadata: { role: 'leader' } })
    providerFor.mockReturnValue({ id: 'strava', fetch: vi.fn().mockResolvedValue(null) })
    const res = await POST(req({ url: 'https://www.strava.com/routes/6647021' }))
    expect(await res.json()).toEqual({ enriched: false })
  })

  it('captures to Sentry and returns { enriched: false } when the provider throws', async () => {
    currentUser.mockResolvedValue({ publicMetadata: { role: 'leader' } })
    providerFor.mockReturnValue({ id: 'strava', fetch: vi.fn().mockRejectedValue(new Error('boom')) })
    const res = await POST(req({ url: 'https://www.strava.com/routes/6647021' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ enriched: false })
    expect(captureException).toHaveBeenCalledOnce()
  })
})
