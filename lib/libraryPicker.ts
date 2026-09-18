import type { WorkoutVariantRow, RunConfig } from './data'
import { kindToCategory } from './runProfile'

export type PickerRecord = {
  familyId: number
  name: string          // family name (from the base variant)
  type: string          // base variant's workout type
  subtitle: string      // base variant's `type` (secondary line in the picker list)
  variants: WorkoutVariantRow[]   // all variants of the family, ordered Standard→Longer
}

/**
 * Filters the shared workout-variant catalog to the run's library (created + adopted)
 * and groups the surviving variants into families (each family carries ALL its variants).
 *
 * #404: scope by LIBRARY MEMBERSHIP — when `libraryFamilyIds` is given, the picker
 * offers exactly the run's library (routes it created OR adopted, run_workouts), which
 * is now the single source of truth. Callers that can't yet supply membership fall back
 * to #401's run_group_id ownership scope (created routes only — safe, no regression). A
 * run not reconciled to a group (runGroupId null, no membership) falls back to the run's
 * category (kind→category) so a legacy run's picker is never empty.
 *
 * Do NOT apply the runConfig.workoutTypes allowlist. Family order is first-seen;
 * variants within each family are sorted by sortOrder ascending (Standard before Longer).
 */
export function pickerRecordsForRun(
  variants: WorkoutVariantRow[],
  runConfig: RunConfig,
  libraryFamilyIds?: number[],
): PickerRecord[] {
  const libSet = libraryFamilyIds ? new Set(libraryFamilyIds) : null
  const filtered = libSet
    ? variants.filter(w => libSet.has(w.familyId))
    : runConfig.runGroupId != null
      ? variants.filter(w => w.runGroupId === runConfig.runGroupId)
      : (() => {
          const category = kindToCategory(runConfig.kind)
          return category == null ? variants : variants.filter(w => w.category === category)
        })()

  const records: PickerRecord[] = []
  const seen = new Set<number>()

  for (const w of filtered) {
    if (seen.has(w.familyId)) continue
    seen.add(w.familyId)

    const members = filtered
      .filter(v => v.familyId === w.familyId)
      .sort((a, b) => (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity))

    const base = members[0]
    records.push({
      familyId: base.familyId,
      name: base.name,
      type: base.type,
      subtitle: base.type,
      variants: members,
    })
  }

  return records
}
