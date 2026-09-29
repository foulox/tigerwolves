import { it, expect } from 'vitest'
import { shouldGenerateDirections } from '@/lib/routeDirections/shouldGenerate'

it('generates when creating (no stored narrative, url present)', () => {
  expect(shouldGenerateDirections({ routeUrl: 'https://strava/1', storedUrl: null, hasStoredNarrative: false })).toBe(true)
})
it('keeps the stored narrative when the url is unchanged', () => {
  expect(shouldGenerateDirections({ routeUrl: 'https://strava/1', storedUrl: 'https://strava/1', hasStoredNarrative: true })).toBe(false)
})
it('regenerates when the url changed', () => {
  expect(shouldGenerateDirections({ routeUrl: 'https://strava/2', storedUrl: 'https://strava/1', hasStoredNarrative: true })).toBe(true)
})
it('does not generate when the url is cleared', () => {
  expect(shouldGenerateDirections({ routeUrl: '   ', storedUrl: 'https://strava/1', hasStoredNarrative: true })).toBe(false)
})
it('regenerates a changed url even if it had no prior narrative', () => {
  expect(shouldGenerateDirections({ routeUrl: 'https://strava/2', storedUrl: 'https://strava/1', hasStoredNarrative: false })).toBe(true)
})
