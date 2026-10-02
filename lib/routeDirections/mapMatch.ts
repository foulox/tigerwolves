import type { LatLng, MatchedStep } from './types'

export function chunkPoints(points: LatLng[], size = 95, overlap = 1): LatLng[][] {
  if (points.length <= size) return points.length >= 2 ? [points] : []
  const step = size - overlap
  const chunks: LatLng[][] = []
  for (let i = 0; i < points.length - 1; i += step) {
    const chunk = points.slice(i, i + size)
    if (chunk.length >= 2) chunks.push(chunk)
    if (i + size >= points.length) break
  }
  return chunks
}

type RawStep = { name?: string; distance?: number; geometry?: { coordinates?: [number, number][] } }

async function matchChunk(chunk: LatLng[], token: string, fetchImpl: typeof fetch): Promise<MatchedStep[]> {
  const coords = chunk.map(([lat, lng]) => `${lng},${lat}`).join(';')
  const radiuses = chunk.map(() => '25').join(';')
  const qs = new URLSearchParams({ geometries: 'geojson', steps: 'true', overview: 'full', tidy: 'true', radiuses, access_token: token })
  const url = `https://api.mapbox.com/matching/v5/mapbox/walking/${coords}?${qs.toString()}`
  try {
    const res = await fetchImpl(url)
    if (!res.ok) return []
    const data = (await res.json()) as { code?: string; matchings?: { legs?: { steps?: RawStep[] }[] }[] }
    if (data.code !== 'Ok' || !data.matchings) return []
    const out: MatchedStep[] = []
    for (const m of data.matchings) for (const leg of m.legs ?? []) for (const s of leg.steps ?? []) {
      const coords = (s.geometry?.coordinates ?? []).map(([lng, lat]) => [lat, lng] as LatLng)
      out.push({ name: s.name ?? '', meters: s.distance ?? 0, coords })
    }
    return out
  } catch {
    return []
  }
}

// Map-match a full GPS trace to ordered steps (name + distance + geometry).
// Turn direction is derived later from the geometry, not from Mapbox's per-step
// maneuver, so chunk boundaries don't drop turns.
export async function mapMatch(points: LatLng[], token: string, fetchImpl: typeof fetch = fetch): Promise<MatchedStep[]> {
  if (!token || points.length < 2) return []
  const all: MatchedStep[] = []
  for (const chunk of chunkPoints(points)) all.push(...(await matchChunk(chunk, token, fetchImpl)))
  return all
}
