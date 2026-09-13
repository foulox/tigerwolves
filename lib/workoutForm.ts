export const FORM_CATEGORIES = ['Easy', 'Long', 'Quality'] as const

export const FORM_TYPES = [
  'Hills', 'Broken Tempo', 'Intervals', 'Progression',
  'Ladder', 'Superset', 'Straight Tempo', 'Threshold',
] as const

// #347: the workout-type vocabulary depends on the category. Quality (Workout
// runs) has the rich set above; Easy/Long runs use their own small vocabularies.
// Without this, the create/edit form only offered Quality types, so an Easy or
// Long workout could never be given a valid type and the form couldn't submit.
// Types may overlap across categories (e.g. Progression is both Quality and Long).
export const TYPES_BY_CATEGORY: Record<string, readonly string[]> = {
  Quality: FORM_TYPES,
  Easy: ['Easy'],
  Long: ['Long'],
}

/** The type chips to offer for a given category (empty until a category is picked). */
export function typesForCategory(category: string): readonly string[] {
  return TYPES_BY_CATEGORY[category] ?? []
}

export const chipBase = 'px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors touch-manipulation'
export const chipDark = 'bg-gray-900 text-white border-gray-900'
export const chipOrange = 'bg-orange-500 text-white border-orange-500'
export const chipOff = 'bg-white text-gray-600 border-gray-200'

export function toggleItem(list: string[], item: string) {
  return list.includes(item) ? list.filter(x => x !== item) : [...list, item]
}

// #354: workout names are effectively global identifiers in the shared catalog
// (schedule entries resolve to a workout by name). When a leader tries to create
// a new workout whose name already exists (case-insensitive, whitespace-trimmed),
// we surface the existing family so they can add a variation to it instead of
// spawning a duplicate. Returns the colliding family, or null if the name is free.
export function findCollidingFamily(
  families: { familyId: number; name: string }[],
  name: string,
): { familyId: number; name: string } | null {
  const norm = name.trim().toLowerCase()
  if (!norm) return null
  return families.find(f => f.name.trim().toLowerCase() === norm) ?? null
}
