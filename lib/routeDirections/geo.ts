import type { LatLng, TurnKind } from './types'

// Equirectangular approximation — accurate to well within 1% at city scale,
// which is all this needs (anchor selection + start/end proximity).
export function metersBetween(a: LatLng, b: LatLng): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const x = toRad(b[1] - a[1]) * Math.cos(toRad((a[0] + b[0]) / 2))
  const y = toRad(b[0] - a[0])
  return Math.sqrt(x * x + y * y) * R
}

export function bearing(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const toDeg = (r: number) => (r * 180) / Math.PI
  const dLon = toRad(b[1] - a[1])
  const y = Math.sin(dLon) * Math.cos(toRad(b[0]))
  const x = Math.cos(toRad(a[0])) * Math.sin(toRad(b[0])) - Math.sin(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.cos(dLon)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

export function classifyTurn(incoming: LatLng[], outgoing: LatLng[]): TurnKind {
  if (incoming.length < 2 || outgoing.length < 2) return 'none'
  const inB = bearing(incoming[incoming.length - 2], incoming[incoming.length - 1])
  const outB = bearing(outgoing[0], outgoing[1])
  let delta = ((outB - inB + 540) % 360) - 180 // signed, [-180, 180]; +right, -left
  const mag = Math.abs(delta)
  if (mag > 150) return 'turnaround'
  if (mag < 30) return 'none'
  const side = delta > 0 ? 'right' : 'left'
  if (mag < 60) return `slight ${side}` as TurnKind
  if (mag <= 120) return side as TurnKind
  return `sharp ${side}` as TurnKind
}
