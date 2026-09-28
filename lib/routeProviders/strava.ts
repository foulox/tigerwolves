import type { RouteProvider, RouteEnrichment } from './types'
import { getStravaAccessToken } from '@/lib/strava/token'
import { takeFirstUrl } from './url'

const METERS_PER_MILE = 1609.344
const FEET_PER_METER = 3.28084

const ROUTE_RE = /strava\.com\/routes\/(\d+)/i

// #459: pull the og:image URL out of a route page's HTML, tolerant of attribute
// order, accepting only absolute http(s) URLs (a relative value would render broken).
export function parseOgImage(html: string): string | null {
  const metas = html.match(/<meta[^>]*>/gi) ?? []
  for (const tag of metas) {
    if (!/property=["']og:image["']/i.test(tag)) continue
    const m = tag.match(/content=["']([^"']+)["']/i)
    if (m && /^https?:\/\//i.test(m[1])) return m[1]
  }
  return null
}

export function parseStravaRouteId(raw: string): string | null {
  const url = takeFirstUrl(raw)
  const m = url.match(ROUTE_RE)
  return m ? m[1] : null // capture group is the digit string — never Number()'d
}

export const stravaProvider: RouteProvider = {
  id: 'strava',
  matches(url: string): boolean {
    return parseStravaRouteId(url) !== null
  },
  async fetch(rawUrl: string): Promise<RouteEnrichment | null> {
    const id = parseStravaRouteId(rawUrl)
    if (!id) return null
    try {
      const token = await getStravaAccessToken()
      const res = await fetch(`https://www.strava.com/api/v3/routes/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return null
      const data = (await res.json()) as {
        name?: string
        distance?: number
        elevation_gain?: number
        map?: { summary_polyline?: string }
      }
      const distance = data.distance ?? 0
      const elevation = data.elevation_gain ?? 0
      return {
        distanceMiles: distance / METERS_PER_MILE,
        elevationFeet: elevation * FEET_PER_METER,
        // #463: no polyline → null geometry, not a shell object, so a future
        // `geometry != null` consumer isn't misled into thinking geometry exists.
        geometry: data.map?.summary_polyline ? { summaryPolyline: data.map.summary_polyline } : null,
        name: data.name,
      }
    } catch {
      return null // network / parse failure → graceful fallback
    }
  },
}
