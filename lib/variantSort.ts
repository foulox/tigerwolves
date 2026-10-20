import type { WorkoutVariantRow } from './data'
import type { VoteData } from './votes'
import { rankByRating } from './rating'

// Story 2: the shared sort model for both pickers. Extracted from the inline sorts
// in LibraryClient / ScheduleClient / schedulePicker so the semantics live (and are
// tested) in one place. Distance sort arrives in Story 4 (#461).
export type SortField = 'recent' | 'rating' | 'az'
export type SortDir = 'asc' | 'desc'

export const DEFAULT_DIR: Record<SortField, SortDir> = {
  recent: 'asc',  // oldest (least recently run) first
  rating: 'desc', // highest first
  az: 'asc',      // A → Z
}

// Dropdown labels name the DIMENSION (a plain noun), not a direction — the arrow
// owns direction. ('Last ran' not 'Least recent'; 'Rating' not 'Top rated'.)
export const SORT_LABELS: Record<SortField, string> = {
  recent: 'Last ran', rating: 'Rating', az: 'A–Z',
}

// Direction only applies where both ends are useful. Rating is always best-first
// (lowest-first is dead weight), so the control hides the arrow for it.
export function directionApplies(field: SortField): boolean {
  return field !== 'rating'
}

// The phrase the count line echoes (after "·") — names the dimension, plus the
// direction where it applies. A reliable behavioral proof the sort's onChange fired.
export function sortCountLabel(field: SortField, dir: SortDir): string {
  if (field === 'rating') return 'Rating'
  if (field === 'az') return dir === 'asc' ? 'A–Z' : 'Z–A'
  return dir === 'asc' ? 'Last ran, oldest first' : 'Last ran, most recent first'
}

// 'recent' is a last-ran ordering, so never-ran rows (lastRan == null) are NOT part
// of it — they are excluded. This fixes the bug where null coerced to '0' floated
// never-run workouts to the top of "Least recent". 'rating' and 'az' keep every row.
// Direction flips a stable base ordering by reversing it.
export function sortVariants(
  rows: WorkoutVariantRow[],
  field: SortField,
  dir: SortDir,
  voteData: Record<string, VoteData | null>,
): WorkoutVariantRow[] {
  let out: WorkoutVariantRow[]
  if (field === 'rating') {
    out = rankByRating(rows, voteData) // high → low (its own stable order)
  } else if (field === 'az') {
    out = [...rows].sort((x, y) => x.name.localeCompare(y.name))
  } else {
    out = rows
      .filter(r => r.lastRan != null)
      .sort((x, y) => (x.lastRan! < y.lastRan! ? -1 : x.lastRan! > y.lastRan! ? 1 : 0))
  }
  return dir === DEFAULT_DIR[field] ? out : [...out].reverse()
}
