import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stravaProvider, parseStravaRouteId, parseOgImage } from '@/lib/routeProviders/strava'

vi.mock('@/lib/strava/token', () => ({
  getStravaAccessToken: vi.fn().mockResolvedValue('tok'),
}))

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

describe('stravaProvider.fetch', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('maps distance (m→mi), elevation_gain (m→ft), and summary_polyline on 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        name: 'Doves loop',
        distance: 16093.44, // 10.0 mi
        elevation_gain: 100, // 328.084 ft
        map: { summary_polyline: 'abc_polyline' },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const r = await stravaProvider.fetch('https://www.strava.com/routes/6647021')
    expect(r).not.toBeNull()
    expect(r!.distanceMiles).toBeCloseTo(10.0, 2)
    expect(r!.elevationFeet).toBeCloseTo(328.084, 1)
    expect(r!.geometry).toEqual({ summaryPolyline: 'abc_polyline' })
    expect(r!.name).toBe('Doves loop')
    // called the routes endpoint with the parsed id and a Bearer token
    const [reqUrl, opts] = fetchMock.mock.calls[0]
    expect(reqUrl).toBe('https://www.strava.com/api/v3/routes/6647021')
    expect((opts as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok' })
  })

  it('yields null geometry (not a shell object) when the route has no summary_polyline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ name: 'No polyline', distance: 1609.344, elevation_gain: 0, map: {} }),
    }))
    const r = await stravaProvider.fetch('https://www.strava.com/routes/6647021')
    expect(r).not.toBeNull()
    expect(r!.geometry).toBeNull()
  })

  it('returns null when the id cannot be parsed', async () => {
    expect(await stravaProvider.fetch('https://strava.com/athletes/1')).toBeNull()
  })

  it('returns null on a non-200 (private/404/401) response — no throw', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    expect(await stravaProvider.fetch('https://www.strava.com/routes/6647021')).toBeNull()
  })

  it('returns null when fetch itself throws (network error) — no throw', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    expect(await stravaProvider.fetch('https://www.strava.com/routes/6647021')).toBeNull()
  })

  it('sets imageUrl from the public page og:image (second fetch)', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        name: 'Doves loop', distance: 16093.44, elevation_gain: 100,
        map: { summary_polyline: 'abc' },
      }) })
      .mockResolvedValueOnce({ ok: true, text: async () =>
        `<meta property="og:image" content="https://d3o5xota0a1fcr.cloudfront.net/v6/maps/ABC">` })
    vi.stubGlobal('fetch', fetchMock)
    const r = await stravaProvider.fetch('https://www.strava.com/routes/6647021')
    expect(r!.imageUrl).toBe('https://d3o5xota0a1fcr.cloudfront.net/v6/maps/ABC')
    expect(r!.distanceMiles).toBeCloseTo(10.0, 2)
  })

  it('omits imageUrl (but still returns metrics) when the page fetch is not ok', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        distance: 16093.44, elevation_gain: 100, map: { summary_polyline: 'abc' },
      }) })
      .mockResolvedValueOnce({ ok: false })
    vi.stubGlobal('fetch', fetchMock)
    const r = await stravaProvider.fetch('https://www.strava.com/routes/6647021')
    expect(r!.imageUrl).toBeUndefined()
    expect(r!.distanceMiles).toBeCloseTo(10.0, 2)
  })

  it('omits imageUrl when the page fetch throws', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        distance: 16093.44, elevation_gain: 100, map: { summary_polyline: 'abc' },
      }) })
      .mockRejectedValueOnce(new Error('network'))
    vi.stubGlobal('fetch', fetchMock)
    const r = await stravaProvider.fetch('https://www.strava.com/routes/6647021')
    expect(r!.imageUrl).toBeUndefined()
    expect(r!.distanceMiles).toBeCloseTo(10.0, 2)
  })
})

describe('parseOgImage', () => {
  it('extracts an absolute og:image URL (property before content)', () => {
    const html = `<meta property="og:image" content="https://d3o5xota0a1fcr.cloudfront.net/v6/maps/ABC">`
    expect(parseOgImage(html)).toBe('https://d3o5xota0a1fcr.cloudfront.net/v6/maps/ABC')
  })
  it('extracts when content comes before property (reversed attr order)', () => {
    const html = `<meta content="https://d3o5xota0a1fcr.cloudfront.net/v6/maps/XYZ" property="og:image">`
    expect(parseOgImage(html)).toBe('https://d3o5xota0a1fcr.cloudfront.net/v6/maps/XYZ')
  })
  it('returns null when there is no og:image tag', () => {
    expect(parseOgImage('<meta property="og:title" content="Doves loop">')).toBeNull()
  })
  it('rejects a non-absolute (protocol-relative) og:image value', () => {
    const html = `<meta property="og:image" content="//drzetlglcbfx.cloudfront.net/thumb/1?size=200x200">`
    expect(parseOgImage(html)).toBeNull()
  })
})
