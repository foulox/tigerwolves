import { describe, it, expect } from 'vitest'
import { providerFor, PROVIDERS } from '@/lib/routeProviders/registry'

describe('providerFor', () => {
  it('returns the strava provider for a strava route URL', () => {
    expect(providerFor('https://www.strava.com/routes/6647021')?.id).toBe('strava')
  })
  it('returns null for a non-matching / empty / garbage URL', () => {
    expect(providerFor('https://www.mapmyrun.com/routes/1')).toBeNull()
    expect(providerFor('')).toBeNull()
    expect(providerFor('nonsense')).toBeNull()
  })
  it('exposes a non-empty provider array so #458 can extend it', () => {
    expect(PROVIDERS.length).toBeGreaterThan(0)
  })
})
