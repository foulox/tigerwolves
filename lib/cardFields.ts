import type { WorkoutVariantRow, CardFieldKey } from './data'

// Local date formatter — matches the formatDate in components/LibraryClient.tsx verbatim.
function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Discriminated union of all renderable field content kinds.
export type FieldContent =
  | { kind: 'text'; text: string; variant: 'body' | 'coaching' }
  | { kind: 'author'; text: string }
  | { kind: 'inline'; parts: string[] }
  | { kind: 'text-inline'; text: string }
  | { kind: 'link'; href: string; label: string }
  | { kind: 'image'; src: string }
  | { kind: 'pills'; variant: 'race' | 'phase'; items: string[] }
  | { kind: 'detail'; label: string; value: string }
  | { kind: 'route'; text: string }

/**
 * Returns the renderable content for a single card field, or null when the
 * field's value is absent. The resolver already skips valueless fields via
 * hasValue(), so null here is a defensive backstop only.
 *
 * Label literals match components/WorkoutDetails.tsx verbatim for visual parity.
 * Distance inline parts mirror the former LibraryClient WorkoutMeta stats row (removed in #506):
 * `${miles.toFixed(1)} mi` · `${Math.round(elev)} ft ↑` · distTime.
 */
export function describeField(w: WorkoutVariantRow, key: CardFieldKey): FieldContent | null {
  switch (key) {
    case 'description':
      if (!w.rawInput) return null
      return { kind: 'text', text: w.rawInput, variant: 'body' }

    case 'coachingNotes':
      if (!w.coachingNotes) return null
      return { kind: 'text', text: w.coachingNotes, variant: 'coaching' }

    case 'distance': {
      const parts: string[] = []
      if (w.distanceMiles != null) parts.push(`${w.distanceMiles.toFixed(1)} mi`)
      if (w.elevationGainFeet != null) parts.push(`${Math.round(w.elevationGainFeet)} ft ↑`)
      if (w.distTime) parts.push(w.distTime)
      return parts.length > 0 ? { kind: 'inline', parts } : null
    }

    case 'lastRan':
      // Always rendered: "Last ran …" or "Never used" (parity with today's card).
      return { kind: 'text-inline', text: w.lastRan ? `Last ran ${formatDate(w.lastRan)}` : 'Never used' }

    case 'mapLink':
      if (!w.mapLink) return null
      return { kind: 'link', href: w.mapLink, label: 'Map ↗' }

    case 'mapImage':
      if (!w.mapImageUrl) return null
      return { kind: 'image', src: w.mapImageUrl }

    case 'raceTypes':
      return { kind: 'pills', variant: 'race', items: w.raceTypes }

    case 'trainingPhases':
      return { kind: 'pills', variant: 'phase', items: w.trainingPhases }

    case 'reason':
      if (!w.reason) return null
      return { kind: 'detail', label: 'Reason', value: w.reason }

    case 'energySystem':
      if (!w.energySystem) return null
      return { kind: 'detail', label: 'Energy System', value: w.energySystem }

    case 'hrZone':
      if (!w.hrZone) return null
      return { kind: 'detail', label: 'HR Zone', value: w.hrZone }

    case 'rpe':
      if (!w.rpe) return null
      return { kind: 'detail', label: 'RPE', value: w.rpe }

    case 'turnaround':
      if (!w.hasTurnaround || !w.turnaround) return null
      return { kind: 'detail', label: 'Turnaround', value: w.turnaround }

    case 'routeNarrative':
      if (!w.routeNarrative) return null
      return { kind: 'route', text: w.routeNarrative }

    case 'author':
      if (!w.author) return null
      return { kind: 'author', text: w.author }
  }
}
