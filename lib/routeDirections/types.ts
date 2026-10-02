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

export type TurnKind =
  | 'none' | 'slight left' | 'left' | 'sharp left'
  | 'slight right' | 'right' | 'sharp right' | 'turnaround'

export type MatchedStep = { name: string; meters: number; coords: LatLng[] }

export type FeatureKind = 'bridge' | 'park' | 'street'
export type RouteLeg = { street: string; miles: number; turn: TurnKind; feature: FeatureKind }
