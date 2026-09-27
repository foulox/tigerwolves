import type { RouteProvider, RouteEnrichment } from './types'

// A link cell may hold "URL_A OR URL_B" — take URL_A.
export function takeFirstUrl(raw: string): string {
  return raw.split(/\s+OR\s+/i)[0]?.trim() ?? ''
}

const ROUTE_RE = /strava\.com\/routes\/(\d+)/i

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
  // fetch implemented in Task 3
  async fetch(): Promise<RouteEnrichment | null> {
    throw new Error('not implemented')
  },
}
