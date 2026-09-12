import { describe, test, expect } from 'vitest'
import { entryTarget } from '../lib/entryRouting'

// #332 — the `/` routing rule. followCount is only consulted when signed in.
describe('entryTarget', () => {
  test('logged out → /all-runs regardless of follow count', () => {
    expect(entryTarget(false, 0)).toBe('/all-runs')
    expect(entryTarget(false, 3)).toBe('/all-runs')
  })

  test('signed in with 0 follows → /all-runs (first-login picker)', () => {
    expect(entryTarget(true, 0)).toBe('/all-runs')
  })

  test('signed in with ≥1 follow → /my-week (home)', () => {
    expect(entryTarget(true, 1)).toBe('/my-week')
    expect(entryTarget(true, 5)).toBe('/my-week')
  })
})
