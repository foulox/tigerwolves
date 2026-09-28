import type { RouteProvider, RouteEnrichment } from './types'
import { takeFirstUrl } from './url'

// MapMyRun serves no public route API, but its route page server-renders the full
// route into `window.__STATE__.routes.route` — distance (m), total_ascent (m), and a
// `points[]` geometry. We fetch the page and read that embedded JSON. (#458)

const METERS_PER_MILE = 1609.344
const FEET_PER_METER = 3.28084

// Only the canonical view URL carries a route id: mapmyrun.com/routes/view/{id}
const ROUTE_RE = /mapmyrun\.com\/routes\/view\/(\d+)/i

// A browser-like UA to avoid any UA-based gating or bot-blocking that could suppress
// the embedded __STATE__ (spike confirmed a browser UA returns the full route state).
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

export function parseMapMyRunRouteId(raw: string): string | null {
  const url = takeFirstUrl(raw)
  const m = url.match(ROUTE_RE)
  return m ? m[1] : null // capture group is the digit string — never Number()'d
}

// Pull the `window.__STATE__ = { ... }` object out of the page HTML via a
// string-aware brace-balanced scan (a greedy regex would over- or under-match on
// braces that appear inside string values). Returns the parsed object, or null.
export function extractState(html: string): unknown | null {
  const marker = 'window.__STATE__'
  const markerIdx = html.indexOf(marker)
  if (markerIdx === -1) return null
  const start = html.indexOf('{', markerIdx)
  if (start === -1) return null

  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < html.length; i++) {
    const c = html[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
    } else if (c === '"') {
      inStr = true
    } else if (c === '{') {
      depth++
    } else if (c === '}') {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null // unbalanced — never closed
}

type MapMyRunRoute = {
  name?: string
  distance?: number // meters
  total_ascent?: number // meters
  points?: unknown[]
}

export const mapMyRunProvider: RouteProvider = {
  id: 'mapmyrun',
  matches(url: string): boolean {
    return parseMapMyRunRouteId(url) !== null
  },
  async fetch(rawUrl: string): Promise<RouteEnrichment | null> {
    const id = parseMapMyRunRouteId(rawUrl)
    if (!id) return null
    try {
      const res = await fetch(`https://www.mapmyrun.com/routes/view/${id}/`, {
        headers: { 'User-Agent': UA },
      })
      if (!res.ok) return null
      const html = await res.text()
      const state = extractState(html) as { routes?: { route?: MapMyRunRoute } } | null
      const route = state?.routes?.route
      // Empty `routes` bucket → dead / private / non-existent route → graceful fallback.
      if (!route || typeof route.distance !== 'number') return null
      const points = Array.isArray(route.points) ? route.points : []
      return {
        distanceMiles: route.distance / METERS_PER_MILE,
        elevationFeet: (route.total_ascent ?? 0) * FEET_PER_METER,
        // no points → null geometry, not a shell object (mirrors Strava's #463 fix)
        geometry: points.length ? { points } : null,
        name: route.name,
      }
    } catch {
      return null // network / parse failure → graceful fallback
    }
  },
}
