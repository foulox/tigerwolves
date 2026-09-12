import { describe, test, expect } from 'vitest'
import { isSeedAllowed } from '../lib/seedFixtures'

describe('isSeedAllowed', () => {
  test('blocks production', () => {
    expect(isSeedAllowed('production')).toBe(false)
  })

  test('allows preview and development', () => {
    expect(isSeedAllowed('preview')).toBe(true)
    expect(isSeedAllowed('development')).toBe(true)
  })

  test('allows local (VERCEL_ENV unset)', () => {
    expect(isSeedAllowed(undefined)).toBe(true)
  })
})
