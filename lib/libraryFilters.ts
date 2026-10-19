import type { WorkoutVariantRow } from './data'
import type { VoteData } from './votes'
import { workoutVoteId } from './votes'
import { passesRatingThreshold, type RatingThreshold } from './rating'

// Story 1A: the Library picker's filter state, extracted from LibraryClient so the
// "what's active / how to summarize / how resets cascade / how to filter" logic is
// pure and unit-tested, and reusable by the Schedule picker (Story 1B).
export type LibraryFilters = {
  category: string | null
  type: string | null
  race: string | null
  rating: RatingThreshold
  showAllRuns: boolean
}

export const EMPTY_FILTERS: LibraryFilters = {
  category: null, type: null, race: null, rating: 'any', showAllRuns: false,
}

// Short labels for the active-filter summary on the Filters button (matches the
// RatingFilter dropdown wording, minus "any").
const RATING_SUMMARY: Record<Exclude<RatingThreshold, 'any'>, string> = {
  ok: '😐 & up', good: '😃 & up', love: '🥳 only',
}

export function activeFilterCount(f: LibraryFilters): number {
  let n = 0
  if (f.category) n++
  if (f.type) n++
  if (f.race) n++
  if (f.rating !== 'any') n++
  if (f.showAllRuns) n++
  return n
}

export function activeFilterSummary(f: LibraryFilters): string {
  const parts: string[] = []
  if (f.category) parts.push(f.category)
  if (f.type) parts.push(f.type)
  if (f.race) parts.push(f.race)
  if (f.rating !== 'any') parts.push(RATING_SUMMARY[f.rating])
  if (f.showAllRuns) parts.push('All runs')
  return parts.join(' · ')
}

export function matchesQuery(w: WorkoutVariantRow, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    w.name.toLowerCase().includes(q) ||
    w.type.toLowerCase().includes(q) ||
    (w.label ?? '').toLowerCase().includes(q) ||
    w.reason.toLowerCase().includes(q) ||
    w.raceTypes.some(r => r.toLowerCase().includes(q))
  )
}

// The facet + query + rating pipeline, lifted verbatim from LibraryClient's
// filteredBase (the scope/visibleVariants step stays in the component — it depends
// on run-library membership, not on this pure filter state). Sort is applied by the
// caller and is unchanged in this story.
export function applyLibraryFilters(
  variants: WorkoutVariantRow[],
  f: LibraryFilters,
  query: string,
  voteData: Record<string, VoteData | null>,
): WorkoutVariantRow[] {
  return variants
    .filter(w => !f.category || w.category === f.category)
    .filter(w => !f.type || w.type === f.type)
    .filter(w => !f.race || w.raceTypes.includes(f.race))
    .filter(w => matchesQuery(w, query))
    .filter(w => passesRatingThreshold(voteData[workoutVoteId(w.name, w.label ?? '')], f.rating))
}

// Reset rules, mirroring LibraryClient's setcat (category change clears type) and
// setScope (scope toggle clears category + type so the two scopes stay independent).
export function withCategory(f: LibraryFilters, category: string | null): LibraryFilters {
  return { ...f, category, type: null }
}

export function withScope(f: LibraryFilters, showAllRuns: boolean): LibraryFilters {
  return { ...f, showAllRuns, category: null, type: null }
}
