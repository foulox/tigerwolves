import type { RouteProvider } from './types'
import { stravaProvider } from './strava'

// The single place the provider set is enumerated. #458 adds mapMyRunProvider here.
export const PROVIDERS: RouteProvider[] = [stravaProvider]

export function providerFor(url: string): RouteProvider | null {
  if (!url) return null
  return PROVIDERS.find(p => p.matches(url)) ?? null
}
