import type { LatLng, RouteShape } from './types'
import { metersBetween } from './geo'

const RETURN_THRESHOLD_M = 200

export function analyzeShape(points: LatLng[]): RouteShape {
  if (points.length < 2) return { returnsToStart: true, startToEndMeters: 0 }
  const startToEndMeters = metersBetween(points[0], points[points.length - 1])
  return { returnsToStart: startToEndMeters <= RETURN_THRESHOLD_M, startToEndMeters }
}
