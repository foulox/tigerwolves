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

    await captureServerEvent('workout_edited')

    expect(captureMock).not.toHaveBeenCalled()
    expect(flushMock).not.toHaveBeenCalled()
  })

  test('captures the event with isLeader=true and flushes when a key is configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_NEXT_PUBLIC_POSTHOG_POSTHOG_PROJECT_TOKEN', 'phc_test_key')
    const { captureServerEvent } = await import('../lib/analytics')

    await captureServerEvent('workout_edited', { turnaroundChanged: true })

    expect(captureMock).toHaveBeenCalledWith({
      distinctId: 'server-actions',
      event: 'workout_edited',
      properties: { isLeader: true, turnaroundChanged: true },
    })
    expect(flushMock).toHaveBeenCalledTimes(1)
  })

  test('never lets a caller-supplied isLeader override the true default', async () => {
    vi.stubEnv('NEXT_PUBLIC_NEXT_PUBLIC_POSTHOG_POSTHOG_PROJECT_TOKEN', 'phc_test_key')
    const { captureServerEvent } = await import('../lib/analytics')

    await captureServerEvent('workout_edited', { isLeader: false })

    expect(captureMock).toHaveBeenCalledWith({
      distinctId: 'server-actions',
      event: 'workout_edited',
      properties: { isLeader: true },
    })
  })

  test('reuses the same client across multiple calls instead of reconnecting each time', async () => {
    vi.stubEnv('NEXT_PUBLIC_NEXT_PUBLIC_POSTHOG_POSTHOG_PROJECT_TOKEN', 'phc_test_key')
    const { captureServerEvent } = await import('../lib/analytics')

    await captureServerEvent('workout_edited')
    await captureServerEvent('workouts_combined')

    expect(PostHog).toHaveBeenCalledTimes(1)
  })

  test('never throws when PostHog is unreachable, so a caller action can still redirect', async () => {
    vi.stubEnv('NEXT_PUBLIC_NEXT_PUBLIC_POSTHOG_POSTHOG_PROJECT_TOKEN', 'phc_test_key')
    flushMock.mockRejectedValueOnce(new Error('network error'))
    const { captureServerEvent } = await import('../lib/analytics')

    await expect(captureServerEvent('workout_edited')).resolves.toBeUndefined()
  })
})
