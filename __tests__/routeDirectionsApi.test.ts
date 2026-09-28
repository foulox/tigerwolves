import { describe, it, expect, vi, beforeEach } from 'vitest'

const currentUser = vi.fn()
vi.mock('@clerk/nextjs/server', () => ({ currentUser: () => currentUser() }))
const generateNarrative = vi.fn()
vi.mock('@/lib/routeDirections', () => ({ generateNarrative: (...a: unknown[]) => generateNarrative(...a) }))
const captureException = vi.fn()
vi.mock('@sentry/nextjs', () => ({ captureException: (...a: unknown[]) => captureException(...a) }))

import { POST } from '@/app/api/route/directions/route'

function req(body: unknown) {
  return new Request('http://localhost/api/route/directions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}

describe('POST /api/route/directions', () => {
  beforeEach(() => { currentUser.mockReset(); generateNarrative.mockReset(); captureException.mockReset() })

  it('401s a non-leader', async () => {
    currentUser.mockResolvedValue({ publicMetadata: { role: 'runner' } })
    expect((await POST(req({ url: 'https://www.strava.com/routes/1' }))).status).toBe(401)
  })

  it('returns the generated narrative for a leader', async () => {
    currentUser.mockResolvedValue({ publicMetadata: { role: 'leader' } })
    generateNarrative.mockResolvedValue('Out of McCarren down Kent...')
    const res = await POST(req({ url: 'https://www.strava.com/routes/1', name: 'DOVES', distanceMiles: 8.5 }))
    expect(await res.json()).toEqual({ narrative: 'Out of McCarren down Kent...' })
  })

  it('returns { narrative: null } when generation yields nothing, without throwing', async () => {
    currentUser.mockResolvedValue({ publicMetadata: { role: 'leader' } })
    generateNarrative.mockResolvedValue(null)
    expect(await (await POST(req({ url: 'https://example.com/x' }))).json()).toEqual({ narrative: null })
  })

  it('captures and swallows a pipeline error', async () => {
    currentUser.mockResolvedValue({ publicMetadata: { role: 'leader' } })
    generateNarrative.mockRejectedValue(new Error('boom'))
    const res = await POST(req({ url: 'https://x' }))
    expect(await res.json()).toEqual({ narrative: null })
    expect(captureException).toHaveBeenCalled()
  })
})
