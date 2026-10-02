import type { LatLng, MatchedStep, RouteLeg, TurnKind, FeatureKind, LandmarkCandidate } from './types'
import { classifyTurn } from './geo'

const MILE = 1609.344

type Agg = { name: string; meters: number; coords: LatLng[] }

export function classifyFeature(street: string, landmarks: LandmarkCandidate[]): FeatureKind {
  if (/bridge/i.test(street)) return 'bridge'
  if (/\bpark\b/i.test(street)) return 'park'
  if (landmarks.some(l => /\bpark\b/i.test(l.name))) return 'park'
  return 'street'
}

function aggregate(steps: MatchedStep[]): Agg[] {
  const legs: Agg[] = []
  for (const s of steps) {
    const last = legs[legs.length - 1]
    if (last && last.name === s.name) { last.meters += s.meters; last.coords.push(...s.coords); continue }
    legs.push({ name: s.name, meters: s.meters, coords: [...s.coords] })
  }
  return legs
}

export function buildLegs(steps: MatchedStep[], minMiles = 0.1, landmarks: LandmarkCandidate[] = []): RouteLeg[] {
  const aggs = aggregate(steps)
  const out: RouteLeg[] = []
  for (let i = 0; i < aggs.length; i++) {
    const a = aggs[i]
    if (!a.name || a.meters / MILE < minMiles) continue
    const prev = aggs[i - 1]
    const turn: TurnKind = prev ? classifyTurn(prev.coords, a.coords) : 'none'
    out.push({ street: a.name, miles: a.meters / MILE, turn, feature: classifyFeature(a.name, landmarks) })
  }
  return out
}
