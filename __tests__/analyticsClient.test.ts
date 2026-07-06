import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import posthog from 'posthog-js'

vi.mock('posthog-js', () => ({
  default: {
    init: vi.fn(),
    capture: vi.fn(),
    register: vi.fn(),
  },
}))

function mockLocalStorage() {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value) },
  }
}

describe('initAnalytics / captureClientEvent', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.mocked(posthog.init).mockClear()
    vi.mocked(posthog.capture).mockClear()
    vi.mocked(posthog.register).mockClear()
    vi.stubGlobal('localStorage', mockLocalStorage())
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  test('no-ops when no PostHog key is configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_NEXT_PUBLIC_POSTHOG_POSTHOG_PROJECT_TOKEN', '')
    const { initAnalytics } = await import('../lib/analyticsClient')

    initAnalytics(false)

    expect(posthog.init).not.toHaveBeenCalled()
  })

  test('initializes PostHog once and registers isLeader', async () => {
    vi.stubEnv('NEXT_PUBLIC_NEXT_PUBLIC_POSTHOG_POSTHOG_PROJECT_TOKEN', 'phc_test_key')
    const { initAnalytics } = await import('../lib/analyticsClient')

    initAnalytics(false)

    expect(posthog.init).toHaveBeenCalledTimes(1)
    expect(posthog.register).toHaveBeenCalledWith({ isLeader: false })
  })

  test('re-registers isLeader on a later call without re-initializing PostHog', async () => {
    vi.stubEnv('NEXT_PUBLIC_NEXT_PUBLIC_POSTHOG_POSTHOG_PROJECT_TOKEN', 'phc_test_key')
    const { initAnalytics } = await import('../lib/analyticsClient')

    initAnalytics(false)
    initAnalytics(true)

    expect(posthog.init).toHaveBeenCalledTimes(1)
    expect(posthog.register).toHaveBeenNthCalledWith(2, { isLeader: true })
  })

  test('captures runner_joined once per browser on a non-leader first visit', async () => {
    vi.stubEnv('NEXT_PUBLIC_NEXT_PUBLIC_POSTHOG_POSTHOG_PROJECT_TOKEN', 'phc_test_key')
    const { initAnalytics } = await import('../lib/analyticsClient')

    initAnalytics(false)
    initAnalytics(false)

    expect(posthog.capture).toHaveBeenCalledTimes(1)
    expect(posthog.capture).toHaveBeenCalledWith('runner_joined')
  })

  test('does not capture runner_joined for a leader', async () => {
    vi.stubEnv('NEXT_PUBLIC_NEXT_PUBLIC_POSTHOG_POSTHOG_PROJECT_TOKEN', 'phc_test_key')
    const { initAnalytics } = await import('../lib/analyticsClient')

    initAnalytics(true)

    expect(posthog.capture).not.toHaveBeenCalled()
  })

  test('captureClientEvent no-ops before initAnalytics has run', async () => {
    vi.stubEnv('NEXT_PUBLIC_NEXT_PUBLIC_POSTHOG_POSTHOG_PROJECT_TOKEN', 'phc_test_key')
    const { captureClientEvent } = await import('../lib/analyticsClient')

    captureClientEvent('heylo_post_copied')

    expect(posthog.capture).not.toHaveBeenCalled()
  })

  test('captureClientEvent fires once initAnalytics has run', async () => {
    vi.stubEnv('NEXT_PUBLIC_NEXT_PUBLIC_POSTHOG_POSTHOG_PROJECT_TOKEN', 'phc_test_key')
    const { initAnalytics, captureClientEvent } = await import('../lib/analyticsClient')

    initAnalytics(true)
    captureClientEvent('heylo_post_copied')

    expect(posthog.capture).toHaveBeenCalledWith('heylo_post_copied', undefined)
  })

  test('does not throw when localStorage access fails', async () => {
    vi.stubEnv('NEXT_PUBLIC_NEXT_PUBLIC_POSTHOG_POSTHOG_PROJECT_TOKEN', 'phc_test_key')
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
    })
    const { initAnalytics } = await import('../lib/analyticsClient')

    expect(() => initAnalytics(false)).not.toThrow()
    expect(posthog.capture).not.toHaveBeenCalled()
  })
})
