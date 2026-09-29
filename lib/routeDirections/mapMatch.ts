import type { LatLng } from './types'

const MAPBOX_MAX_COORDS = 100

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

export function stitchStreets(stepNames: string[]): string[] {
  const out: string[] = []
  for (const raw of stepNames) {
    const name = (raw ?? '').trim()
    if (!name) continue
    if (out[out.length - 1] !== name) out.push(name)
  }
  return out
}

async function matchChunk(chunk: LatLng[], token: string, fetchImpl: typeof fetch): Promise<string[]> {
  const coords = chunk.map(([lat, lng]) => `${lng},${lat}`).join(';')
  const radiuses = chunk.map(() => '25').join(';')
  const qs = new URLSearchParams({ geometries: 'geojson', steps: 'true', overview: 'full', tidy: 'true', radiuses, access_token: token })
  const url = `https://api.mapbox.com/matching/v5/mapbox/walking/${coords}?${qs.toString()}`
  try {
    const res = await fetchImpl(url)
    if (!res.ok) return []
    const data = (await res.json()) as { code?: string; matchings?: { legs?: { steps?: { name?: string }[] }[] }[] }
    if (data.code !== 'Ok' || !data.matchings) return []
    const names: string[] = []
    for (const m of data.matchings) for (const leg of m.legs ?? []) for (const s of leg.steps ?? []) names.push(s.name ?? '')
    return names
  } catch {
    return []
  }
}

// Map-match a full GPS trace to ordered street names. If the map token is
// missing, or every chunk fails, returns []. MAPBOX_MAX_COORDS documents the cap
// that MAPBOX chunk size (95) stays under.
export async function mapMatch(points: LatLng[], token: string, fetchImpl: typeof fetch = fetch): Promise<string[]> {
  if (!token || points.length < 2) return []
  void MAPBOX_MAX_COORDS
  const chunks = chunkPoints(points)
  const all: string[] = []
  for (const chunk of chunks) all.push(...(await matchChunk(chunk, token, fetchImpl)))
  return stitchStreets(all)
}
