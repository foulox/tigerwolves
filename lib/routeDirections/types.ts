export type LatLng = [number, number] // [lat, lng]

export type RouteShape = { returnsToStart: boolean; startToEndMeters: number }

export type LandmarkCandidate = { name: string; anchor: 'start' | 'turnaround' | 'end'; distanceMeters: number }

export type DirectionsInput = {
  routeName: string | null
  distanceMiles: number | null
  streets: string[]
  shape: RouteShape
  landmarks: LandmarkCandidate[]
}
