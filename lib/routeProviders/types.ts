export type RouteEnrichment = {
  distanceMiles: number
  elevationFeet: number
  geometry: unknown            // provider-native geometry payload (Strava: { summaryPolyline: string }; MapMyRun: { points: [...] })
  name?: string
  imageUrl?: string            // #459: provider's own static map image (Strava og:image); omitted when none
}

export interface RouteProvider {
  id: string                                   // e.g. 'strava'
  matches(url: string): boolean
  fetch(url: string): Promise<RouteEnrichment | null>
}
