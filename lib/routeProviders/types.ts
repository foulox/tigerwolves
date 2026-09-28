export type RouteEnrichment = {
  distanceMiles: number
  elevationFeet: number
  geometry: unknown            // provider-native geometry payload (Strava: { summaryPolyline: string }; MapMyRun: { points: [...] })
  name?: string
}

export interface RouteProvider {
  id: string                                   // e.g. 'strava'
  matches(url: string): boolean
  fetch(url: string): Promise<RouteEnrichment | null>
}
