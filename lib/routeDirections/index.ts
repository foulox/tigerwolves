import type { LatLng, DirectionsInput, MatchedStep } from './types'
import { fetchFullTrace as realFetchFullTrace } from './trace'
import { mapMatch as realMapMatch } from './mapMatch'
import { landmarks as realLandmarks } from './landmarks'
import { analyzeShape } from './shape'
import { composeNarrative as realCompose } from './narrative'
import { buildLegs } from './legs'

export type GenerateDeps = {
  fetchFullTrace: (url: string) => Promise<LatLng[]>
  mapMatch: (points: LatLng[], token: string) => Promise<MatchedStep[]>
  landmarks: (points: LatLng[], token: string) => Promise<DirectionsInput['landmarks']>
  composeNarrative: (input: DirectionsInput) => Promise<string>
}

export async function generateNarrative(
  args: { url: string; routeName?: string | null; distanceMiles?: number | null },
  deps: Partial<GenerateDeps> = {},
): Promise<string | null> {
  const token = process.env.MAPBOX_TOKEN ?? ''
  const fetchFullTrace = deps.fetchFullTrace ?? realFetchFullTrace
  const mapMatch = deps.mapMatch ?? ((p: LatLng[]) => realMapMatch(p, token))
  const landmarks = deps.landmarks ?? ((p: LatLng[]) => realLandmarks(p, token))
  const composeNarrative = deps.composeNarrative ?? realCompose

  const trace = await fetchFullTrace(args.url)
  if (trace.length < 2) return null

  const [steps, marks] = await Promise.all([mapMatch(trace, token), landmarks(trace, token)])
  const legs = buildLegs(steps, 0.1)
  if (legs.length === 0 && marks.length === 0) return null

  const input: DirectionsInput = {
    routeName: args.routeName ?? null,
    distanceMiles: args.distanceMiles ?? null,
    legs,
    shape: analyzeShape(trace),
    landmarks: marks,
  }
  const narrative = await composeNarrative(input)
  return narrative.trim() || null
}
