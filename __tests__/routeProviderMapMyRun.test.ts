import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  mapMyRunProvider,
  parseMapMyRunRouteId,
  extractState,
} from '@/lib/routeProviders/mapmyrun'

// A realistic route page: the route data is server-rendered into `window.__STATE__`.
// The description deliberately contains braces and escaped quotes so the extractor's
// string-aware brace matching is exercised, not just a naive "first { to last }".
const FIXTURE = `<!doctype html><html><head><title>MapMyRun</title></head><body>
<script>window.__APP_VERSION__ = "1.2.3";</script>
<script>window.__STATE__ = {"site":{"name":"MapMyRun"},"routes":{"route":{"city":"Long Island City","distance":16093.44,"total_ascent":100,"name":"doves 1776 run","description":"loop } with {braces} and \\"quotes\\"","points":[{"lng":-73.95,"lat":40.72,"ele":-1.1,"dis":0},{"lng":-73.94,"lat":40.73,"ele":2,"dis":11.06}]}}};</script>
<div>trailing markup</div></body></html>`

// A dead / private / non-existent route: the page still renders, but `routes` is empty.
const FIXTURE_EMPTY = `<html><body><script>window.__STATE__ = {"site":{"name":"MapMyRun"},"routes":{}};</script></body></html>`

describe('mapMyRunProvider.matches', () => {
  it('matches view URLs with/without scheme, www, trailing slash, query', () => {
    expect(mapMyRunProvider.matches('https://www.mapmyrun.com/routes/view/6123522511/')).toBe(true)
    expect(mapMyRunProvider.matches('mapmyrun.com/routes/view/6123522511')).toBe(true)
    expect(mapMyRunProvider.matches('http://www.mapmyrun.com/routes/view/6123522511?foo=bar')).toBe(true)
  })
  it('does not match non-mapmyrun, non-view, empty, or garbage links', () => {
    expect(mapMyRunProvider.matches('https://www.strava.com/routes/6647021')).toBe(false)
    expect(mapMyRunProvider.matches('https://www.mapmyrun.com/routes/1')).toBe(false) // not a /view/ URL
    expect(mapMyRunProvider.matches('')).toBe(false)
    expect(mapMyRunProvider.matches('not a url')).toBe(false)
  })
  it('matches when the cell holds "URL_A OR URL_B" and URL_A is mapmyrun', () => {
    expect(mapMyRunProvider.matches('https://www.mapmyrun.com/routes/view/6123522511 OR https://strava.com/x')).toBe(true)
  })
})

describe('parseMapMyRunRouteId', () => {
  it('parses the id from a view URL', () => {
    expect(parseMapMyRunRouteId('https://www.mapmyrun.com/routes/view/6123522511/')).toBe('6123522511')
  })
  it('strips trailing slash and query params', () => {
    expect(parseMapMyRunRouteId('https://www.mapmyrun.com/routes/view/6123522511/?utm=x')).toBe('6123522511')
  })
  it('takes URL_A from a two-URL cell', () => {
    expect(parseMapMyRunRouteId('https://www.mapmyrun.com/routes/view/111 OR https://www.mapmyrun.com/routes/view/222')).toBe('111')
  })
  it('returns null for a non-view or garbage input', () => {
    expect(parseMapMyRunRouteId('https://www.mapmyrun.com/routes/1')).toBeNull()
    expect(parseMapMyRunRouteId('')).toBeNull()
  })
})

describe('extractState', () => {
  it('extracts the balanced __STATE__ object even when a string value contains braces and escaped quotes', () => {
    const state = extractState(FIXTURE) as { routes: { route: { name: string; description: string } } }
    expect(state.routes.route.name).toBe('doves 1776 run')
    expect(state.routes.route.description).toBe('loop } with {braces} and "quotes"')
  })
  it('returns null when the __STATE__ marker is absent', () => {
    expect(extractState('<html><body>no state here</body></html>')).toBeNull()
  })
  it('returns null when the embedded JSON is malformed', () => {
    expect(extractState('<script>window.__STATE__ = {"routes":{ oops;</script>')).toBeNull()
  })
})

describe('mapMyRunProvider.fetch', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('maps distance (m→mi), total_ascent (m→ft), points geometry, and name on 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => FIXTURE })
    vi.stubGlobal('fetch', fetchMock)
    const r = await mapMyRunProvider.fetch('https://www.mapmyrun.com/routes/view/6123522511/')
    expect(r).not.toBeNull()
    expect(r!.distanceMiles).toBeCloseTo(10.0, 2)
    expect(r!.elevationFeet).toBeCloseTo(328.084, 1)
    expect(r!.geometry).toEqual({
      points: [
        { lng: -73.95, lat: 40.72, ele: -1.1, dis: 0 },
        { lng: -73.94, lat: 40.73, ele: 2, dis: 11.06 },
      ],
    })
    expect(r!.name).toBe('doves 1776 run')
    // fetched the route page (not an API) with a browser UA
    const [reqUrl, opts] = fetchMock.mock.calls[0]
    expect(String(reqUrl)).toContain('mapmyrun.com/routes/view/6123522511')
    expect((opts as RequestInit).headers).toMatchObject({ 'User-Agent': expect.stringContaining('Mozilla') })
  })

  it('returns null when the routes bucket is empty (dead/private/non-existent route)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => FIXTURE_EMPTY }))
    expect(await mapMyRunProvider.fetch('https://www.mapmyrun.com/routes/view/999')).toBeNull()
  })

  it('yields null geometry (not a shell) when the route has no points', async () => {
    const noPoints = `<script>window.__STATE__ = {"routes":{"route":{"distance":1609.344,"total_ascent":0,"name":"flat","points":[]}}};</script>`
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => noPoints }))
    const r = await mapMyRunProvider.fetch('https://www.mapmyrun.com/routes/view/1')
    expect(r).not.toBeNull()
    expect(r!.geometry).toBeNull()
  })

  it('returns null when the id cannot be parsed', async () => {
    expect(await mapMyRunProvider.fetch('https://www.mapmyrun.com/routes/1')).toBeNull()
  })

  it('returns null on a non-200 response — no throw', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    expect(await mapMyRunProvider.fetch('https://www.mapmyrun.com/routes/view/6123522511')).toBeNull()
  })

  it('returns null when fetch itself throws (network error) — no throw', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    expect(await mapMyRunProvider.fetch('https://www.mapmyrun.com/routes/view/6123522511')).toBeNull()
  })
})
