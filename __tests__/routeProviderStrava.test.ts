import { describe, it, expect } from 'vitest'
import { stravaProvider, parseStravaRouteId } from '@/lib/routeProviders/strava'

describe('stravaProvider.matches', () => {
  it('matches short and long strava route URLs, with/without scheme/www', () => {
    expect(stravaProvider.matches('https://www.strava.com/routes/6647021')).toBe(true)
    expect(stravaProvider.matches('strava.com/routes/3506443192297552740')).toBe(true)
    expect(stravaProvider.matches('http://strava.com/routes/6647021?foo=bar')).toBe(true)
  })
  it('does not match non-strava, empty, or garbage links', () => {
    expect(stravaProvider.matches('https://www.mapmyrun.com/routes/123')).toBe(false)
    expect(stravaProvider.matches('')).toBe(false)
    expect(stravaProvider.matches('not a url')).toBe(false)
    expect(stravaProvider.matches('https://strava.com/athletes/999')).toBe(false) // not a route URL
  })
  it('matches when the cell holds "URL_A OR URL_B" and URL_A is strava', () => {
    expect(stravaProvider.matches('https://www.strava.com/routes/6647021 OR https://mapmyrun.com/x')).toBe(true)
  })
})

describe('parseStravaRouteId', () => {
  it('parses a short id', () => {
    expect(parseStravaRouteId('https://www.strava.com/routes/6647021')).toBe('6647021')
  })
  it('parses a long id WITHOUT coercing to a number (kept as string)', () => {
    const id = parseStravaRouteId('strava.com/routes/3506443192297552740')
    expect(id).toBe('3506443192297552740')
    expect(typeof id).toBe('string')
  })
  it('strips query params and trailing slashes', () => {
    expect(parseStravaRouteId('https://www.strava.com/routes/6647021/?utm=x')).toBe('6647021')
  })
  it('takes URL_A from a two-URL cell', () => {
    expect(parseStravaRouteId('https://www.strava.com/routes/6647021 OR https://strava.com/routes/999')).toBe('6647021')
  })
  it('returns null for a non-route or garbage input', () => {
    expect(parseStravaRouteId('https://strava.com/athletes/999')).toBeNull()
    expect(parseStravaRouteId('')).toBeNull()
  })
})
