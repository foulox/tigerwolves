import { describe, it, expect } from 'vitest'
import { providerFor, PROVIDERS } from '@/lib/routeProviders/registry'

describe('providerFor', () => {
  it('returns the strava provider for a strava route URL', () => {
    expect(providerFor('https://www.strava.com/routes/6647021')?.id).toBe('strava')
  })
  it('returns the mapmyrun provider for a mapmyrun view URL', () => {
    expect(providerFor('https://www.mapmyrun.com/routes/view/6123522511/')?.id).toBe('mapmyrun')
  })
  it('returns null for a non-matching / empty / garbage URL', () => {
    expect(providerFor('https://www.mapmyrun.com/routes/1')).toBeNull() // not a /view/ URL
    expect(providerFor('')).toBeNull()
    expect(providerFor('nonsense')).toBeNull()
  })
  it('enumerates both providers', () => {
    expect(PROVIDERS.map(p => p.id)).toEqual(['strava', 'mapmyrun'])
  })
})
