import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { PostHog } from 'posthog-node'

const captureMock = vi.fn()
const flushMock = vi.fn().mockResolvedValue(undefined)

vi.mock('posthog-node', () => ({
  PostHog: vi.fn().mockImplementation(function () {
    return { capture: captureMock, flush: flushMock }
  }),
}))

describe('captureServerEvent', () => {
  beforeEach(() => {
    vi.resetModules()
    captureMock.mockClear()
    flushMock.mockClear()
    vi.mocked(PostHog).mockClear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('no-ops when NEXT_PUBLIC_NEXT_PUBLIC_POSTHOG_POSTHOG_PROJECT_TOKEN is not set', async () => {
    vi.stubEnv('NEXT_PUBLIC_NEXT_PUBLIC_POSTHOG_POSTHOG_PROJECT_TOKEN', '')
    const { captureServerEvent } = await import('../lib/analytics')

    await captureServerEvent('workout_edited', 'user_123')

    expect(captureMock).not.toHaveBeenCalled()
    expect(flushMock).not.toHaveBeenCalled()
  })

  test('captures the event with the caller-supplied distinctId and properties, and flushes when a key is configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_NEXT_PUBLIC_POSTHOG_POSTHOG_PROJECT_TOKEN', 'phc_test_key')
    const { captureServerEvent } = await import('../lib/analytics')

    await captureServerEvent('workout_edited', 'user_123', { isLeader: true, turnaroundChanged: true })

    expect(captureMock).toHaveBeenCalledWith({
      distinctId: 'user_123',
      event: 'workout_edited',
      properties: { isLeader: true, turnaroundChanged: true },
    })
    expect(flushMock).toHaveBeenCalledTimes(1)
  })

  test('passes through a caller-supplied isLeader=false as-is (no longer forced to true)', async () => {
    vi.stubEnv('NEXT_PUBLIC_NEXT_PUBLIC_POSTHOG_POSTHOG_PROJECT_TOKEN', 'phc_test_key')
    const { captureServerEvent } = await import('../lib/analytics')

    await captureServerEvent('reaction_cast', 'anonymous-runner', { isLeader: false })

    expect(captureMock).toHaveBeenCalledWith({
      distinctId: 'anonymous-runner',
      event: 'reaction_cast',
      properties: { isLeader: false },
    })
  })

  test('reuses the same client across multiple calls instead of reconnecting each time', async () => {
    vi.stubEnv('NEXT_PUBLIC_NEXT_PUBLIC_POSTHOG_POSTHOG_PROJECT_TOKEN', 'phc_test_key')
    const { captureServerEvent } = await import('../lib/analytics')

    await captureServerEvent('workout_edited', 'user_123')
    await captureServerEvent('workouts_combined', 'user_123')

    expect(PostHog).toHaveBeenCalledTimes(1)
  })

  test('never throws when PostHog is unreachable, so a caller action can still redirect', async () => {
    vi.stubEnv('NEXT_PUBLIC_NEXT_PUBLIC_POSTHOG_POSTHOG_PROJECT_TOKEN', 'phc_test_key')
    flushMock.mockRejectedValueOnce(new Error('network error'))
    const { captureServerEvent } = await import('../lib/analytics')

    await expect(captureServerEvent('workout_edited', 'user_123')).resolves.toBeUndefined()
  })
})
