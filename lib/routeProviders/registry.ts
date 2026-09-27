import type { RouteProvider } from './types'
import { stravaProvider } from './strava'
import { mapMyRunProvider } from './mapmyrun'

// The single place the provider set is enumerated.
export const PROVIDERS: RouteProvider[] = [stravaProvider, mapMyRunProvider]

export function providerFor(url: string): RouteProvider | null {
  if (!url) return null
  return PROVIDERS.find(p => p.matches(url)) ?? null
}
