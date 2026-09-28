import type { LatLng } from './types'
import { parseStravaRouteId, fetchStravaLatLng } from '@/lib/routeProviders/strava'
import { parseMapMyRunRouteId, fetchMapMyRunLatLng } from '@/lib/routeProviders/mapmyrun'

export async function fetchFullTrace(url: string, fetchImpl: typeof fetch = fetch): Promise<LatLng[]> {
  const stravaId = parseStravaRouteId(url)
  if (stravaId) return fetchStravaLatLng(stravaId, fetchImpl)
  const mmrId = parseMapMyRunRouteId(url)
  if (mmrId) return fetchMapMyRunLatLng(mmrId, fetchImpl)
  return []
}
