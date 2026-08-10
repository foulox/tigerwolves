import type { Workout } from './data'
import { FORM_CATEGORIES, FORM_TYPES } from './workoutForm'

export type BackfillVariant = {
  legacyVariation: string
  label: string | null
  sortOrder: number | null
  rawInput: string
  energySystem: string
  hrZone: string
  rpe: string
  distTime: string
  raceTypes: string[]
  trainingPhases: string[]
  hasTurnaround: boolean
  turnaround: string
  flagged: boolean
  flagNote: string
  warnings: string[]
  approved: boolean
  committed: boolean
  variantId: number | null
}

export type BackfillFamily = {
  legacyName: string
  category: string
  type: string
  reason: string
  author: string | null
  coachingNotes: string | null
  mapLink: string | null
  runGroupId: number | null
  warnings: string[]
  familyId: number | null
  variants: BackfillVariant[]
}

const FAMILY_LEVEL_FIELDS = ['category', 'type', 'reason', 'author', 'coachingNotes', 'mapLink'] as const

// Legacy `workouts` rows sharing a `name` are already an implicit family (see
// RegroupWorkoutsForm) but store category/type/reason/author/coachingNotes/
// mapLink per-row, while the new schema lifts those to the shared
// workout_families row. There's no guarantee those values actually agree
// across a family's rows, so we pick the lowest-progression row (falling back
// to variation name) as the representative and surface a warning for anything
// that disagrees — Lou resolves it in the review file rather than the script
// silently picking a winner.
function pickRepresentative(members: Workout[]): Workout {
  return [...members].sort((a, b) => {
    if (a.progression == null && b.progression == null) return a.variation.localeCompare(b.variation)
    if (a.progression == null) return 1
    if (b.progression == null) return -1
    return a.progression - b.progression
  })[0]
}

export function groupWorkoutsIntoFamilies(workouts: Workout[], defaultRunGroupId: number | null): BackfillFamily[] {
  const byName = new Map<string, Workout[]>()
  for (const w of workouts) {
    const list = byName.get(w.name)
    if (list) list.push(w)
    else byName.set(w.name, [w])
  }

  const families: BackfillFamily[] = []
  for (const [name, members] of byName) {
    const rep = pickRepresentative(members)
    const warnings: string[] = []

    for (const field of FAMILY_LEVEL_FIELDS) {
      const distinct = new Set(members.map(w => w[field] ?? ''))
      if (distinct.size > 1) {
        const repValue = rep[field] ?? ''
        const others = [...distinct].filter(v => v !== repValue)
        warnings.push(
          `"${field}" differs across variants of "${name}" — using "${repValue}" from ` +
          `"${rep.variation || '(base)'}"; other value(s): ${others.join(' | ')}`
        )
      }
    }
    if (!(FORM_CATEGORIES as readonly string[]).includes(rep.category)) {
      warnings.push(`category "${rep.category}" is not one of the current form categories (${FORM_CATEGORIES.join(', ')})`)
    }
    if (!(FORM_TYPES as readonly string[]).includes(rep.type)) {
      warnings.push(`type "${rep.type}" is not one of the current form types (${FORM_TYPES.join(', ')})`)
    }

    families.push({
      legacyName: name,
      category: rep.category,
      type: rep.type,
      reason: rep.reason,
      author: rep.author,
      coachingNotes: rep.coachingNotes,
      mapLink: rep.mapLink,
      runGroupId: defaultRunGroupId,
      warnings,
      familyId: null,
      variants: members.map(w => ({
        legacyVariation: w.variation,
        label: w.variation || null,
        sortOrder: w.progression,
        rawInput: w.instructions,
        energySystem: w.energySystem,
        hrZone: w.hrZone,
        rpe: w.rpe,
        distTime: w.distTime,
        raceTypes: w.raceTypes,
        trainingPhases: w.trainingPhases,
        hasTurnaround: w.hasTurnaround,
        turnaround: '',
        flagged: w.flagged,
        flagNote: w.flagNote,
        warnings: [],
        approved: false,
        committed: false,
        variantId: null,
      })),
    })
  }
  return families
}
