import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('demoVoteData', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns avg in range 3–5', async () => {
    const { demoVoteData } = await import('@/lib/demo')
    const result = demoVoteData('some-workout-id')
    expect(result.avg).toBeGreaterThanOrEqual(3)
    expect(result.avg).toBeLessThanOrEqual(5)
  })

  it('returns count in range 5–19', async () => {
    const { demoVoteData } = await import('@/lib/demo')
    const result = demoVoteData('some-workout-id')
    expect(result.count).toBeGreaterThanOrEqual(5)
    expect(result.count).toBeLessThanOrEqual(19)
  })

  it('is deterministic — same id returns same data', async () => {
    const { demoVoteData } = await import('@/lib/demo')
    const a = demoVoteData('Broken Tempo||Standard')
    const b = demoVoteData('Broken Tempo||Standard')
    expect(a).toEqual(b)
  })

  it('different ids return different data', async () => {
    const { demoVoteData } = await import('@/lib/demo')
    const a = demoVoteData('Hills||Standard')
    const b = demoVoteData('Ladder||Standard')
    // Not guaranteed but overwhelmingly likely for distinct inputs
    expect(a).not.toEqual(b)
  })
})

describe('isDemoMode', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  it('is false when NEXT_PUBLIC_DEMO_MODE is not set', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', '')
    const { isDemoMode } = await import('@/lib/demo')
    expect(isDemoMode).toBe(false)
  })

  it('is true when NEXT_PUBLIC_DEMO_MODE=true', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true')
    const { isDemoMode } = await import('@/lib/demo')
    expect(isDemoMode).toBe(true)
  })

  it('is false for any other value', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', '1')
    const { isDemoMode } = await import('@/lib/demo')
    expect(isDemoMode).toBe(false)
  })
})
