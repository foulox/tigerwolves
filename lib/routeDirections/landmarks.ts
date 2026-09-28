import type { LatLng, LandmarkCandidate } from './types'
import { metersBetween } from './geo'

export type TilequeryFeature = { properties: { name?: string; tilequery?: { distance?: number } } }

const MAX_PER_ANCHOR = 4

export function anchorPoints(points: LatLng[]): { start: LatLng; turnaround: LatLng; end: LatLng } {
  const start = points[0]
  const end = points[points.length - 1]
  let turnaround = start
  let best = -1
  for (const p of points) {
    const d = metersBetween(start, p)
    if (d > best) { best = d; turnaround = p }
  }
  return { start, turnaround, end }
}

export function rankCandidates(features: TilequeryFeature[], anchor: LandmarkCandidate['anchor']): LandmarkCandidate[] {
  const byName = new Map<string, number>()
  for (const f of features) {
    const name = f.properties.name?.trim()
    if (!name) continue
    const d = f.properties.tilequery?.distance ?? Number.MAX_SAFE_INTEGER
    if (!byName.has(name) || d < byName.get(name)!) byName.set(name, d)
  }
  return [...byName.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, MAX_PER_ANCHOR)
    .map(([name, distanceMeters]) => ({ name, anchor, distanceMeters: Math.round(distanceMeters) }))
}

async function queryAnchor(p: LatLng, anchor: LandmarkCandidate['anchor'], token: string, fetchImpl: typeof fetch): Promise<LandmarkCandidate[]> {
  const [lat, lng] = p
  const url = `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/tilequery/${lng},${lat}.json?radius=250&limit=25&access_token=${token}`
  try {
    const res = await fetchImpl(url)
    if (!res.ok) return []
    const data = (await res.json()) as { features?: TilequeryFeature[] }
    return rankCandidates(data.features ?? [], anchor)
  } catch {
    return []
  }
}

export async function landmarks(points: LatLng[], token: string, fetchImpl: typeof fetch = fetch): Promise<LandmarkCandidate[]> {
  if (!token || points.length < 2) return []
  const a = anchorPoints(points)
  const [start, turn, end] = await Promise.all([
    queryAnchor(a.start, 'start', token, fetchImpl),
    queryAnchor(a.turnaround, 'turnaround', token, fetchImpl),
    queryAnchor(a.end, 'end', token, fetchImpl),
  ])
  return [...start, ...turn, ...end]
}
