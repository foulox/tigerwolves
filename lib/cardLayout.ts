import type { WorkoutVariantRow, CardTemplate, CardFieldKey } from './data'

// Presence predicate per placeable field. "description" maps to rawInput — the
// free-form workout description block on today's card (confirm against
// LibraryClient render during Story 2 wiring; the key name stays stable either way).
const PRESENCE: Record<CardFieldKey, (w: WorkoutVariantRow) => boolean> = {
  description:    w => !!w.rawInput?.trim(),
  coachingNotes:  w => !!w.coachingNotes?.trim(),
  distance:       w => w.distanceMiles != null || w.elevationGainFeet != null || !!w.distTime,
  lastRan:        () => true,  // always rendered: "Last ran …" or "Never used"
  mapLink:        w => !!w.mapLink,
  mapImage:       w => !!w.mapImageUrl,
  routeNarrative: w => !!w.routeNarrative?.trim(),
  reason:         w => !!w.reason?.trim(),
  energySystem:   w => !!w.energySystem?.trim(),
  hrZone:         w => !!w.hrZone?.trim(),
  rpe:            w => !!w.rpe?.trim(),
  turnaround:     w => w.hasTurnaround && !!w.turnaround?.trim(),
  raceTypes:      w => w.raceTypes.length > 0,
  trainingPhases: w => w.trainingPhases.length > 0,
  author:         w => !!w.author,
}

export function hasValue(w: WorkoutVariantRow, key: CardFieldKey): boolean {
  return PRESENCE[key]?.(w) ?? false
}

// Reproduces today's card: description + coaching notes, then a stats row
// (distance/last-ran left, map link right per #411), then classification pills;
// the rest behind "Show details". Verify visually against the live card in Story 2.
export const DEFAULT_CARD_TEMPLATE: CardTemplate = {
  version: 1,
  upfront: [
    { fields: [{ key: 'description', align: 'left' }] },
    { fields: [{ key: 'coachingNotes', align: 'left' }] },
    { fields: [{ key: 'distance', align: 'left' }, { key: 'lastRan', align: 'left' },
               { key: 'mapLink', align: 'right' }] },
    { fields: [{ key: 'raceTypes', align: 'left' }, { key: 'trainingPhases', align: 'left' }] },
    { fields: [{ key: 'author', align: 'left' }] },
  ],
  expanded: [
    { fields: [{ key: 'reason', align: 'left' }] },
    { fields: [{ key: 'energySystem', align: 'left' }, { key: 'hrZone', align: 'left' }] },
    { fields: [{ key: 'rpe', align: 'left' }] },
    { fields: [{ key: 'turnaround', align: 'left' }] },
    { fields: [{ key: 'routeNarrative', align: 'left' }] },
    { fields: [{ key: 'mapImage', align: 'left' }] },
  ],
  hidden: [],
}

export type ResolvedField = { key: CardFieldKey }
export type ResolvedRow = { left: ResolvedField[]; right: ResolvedField[] }
export type ResolvedCard = { upfront: ResolvedRow[]; expanded: ResolvedRow[] }

const KNOWN = new Set<CardFieldKey>(Object.keys(PRESENCE) as CardFieldKey[])

function resolveSection(w: WorkoutVariantRow, rows: CardTemplate['upfront']): ResolvedRow[] {
  const out: ResolvedRow[] = []
  for (const row of rows) {
    const left: ResolvedField[] = []
    const right: ResolvedField[] = []
    for (const p of row.fields) {
      if (!KNOWN.has(p.key)) continue          // unknown key → ignore
      if (!hasValue(w, p.key)) continue         // empty value → skip
      ;(p.align === 'right' ? right : left).push({ key: p.key })
    }
    if (left.length || right.length) out.push({ left, right })  // drop empty rows
  }
  return out
}

export function resolveCardLayout(
  w: WorkoutVariantRow, layout: CardTemplate | null,
): ResolvedCard {
  const t = layout ?? DEFAULT_CARD_TEMPLATE
  return { upfront: resolveSection(w, t.upfront), expanded: resolveSection(w, t.expanded) }
}

export function parseCardTemplate(raw: unknown): CardTemplate | null {
  if (!raw || typeof raw !== 'object') return null
  const t = raw as Record<string, unknown>
  if (t.version !== 1) return null
  if (!Array.isArray(t.upfront) || !Array.isArray(t.expanded) || !Array.isArray(t.hidden)) return null
  // Shape is trusted enough for the resolver, which already ignores unknown keys
  // and skips valueless fields; deeper validation would duplicate resolver guards.
  return { version: 1, upfront: t.upfront, expanded: t.expanded, hidden: t.hidden } as CardTemplate
}
