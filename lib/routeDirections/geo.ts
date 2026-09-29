import type { LatLng } from './types'

// Equirectangular approximation — accurate to well within 1% at city scale,
// which is all this needs (anchor selection + start/end proximity).
export function metersBetween(a: LatLng, b: LatLng): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const x = toRad(b[1] - a[1]) * Math.cos(toRad((a[0] + b[0]) / 2))
  const y = toRad(b[0] - a[0])
  return Math.sqrt(x * x + y * y) * R
}
