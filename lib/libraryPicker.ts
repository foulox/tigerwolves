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
 * Filters the shared workout-variant catalog to the run's OWN workouts and groups
 * the surviving variants into families (each family carries ALL its variants).
 *
 * #401 (Story A): scope by run_group_id — a run's picker offers only the workouts
 * its group owns. A run not yet reconciled to a group (runGroupId null) falls back
 * to the run's category (kind→category), preserving the pre-Story-A behavior so a
 * legacy run's picker is never empty. Do NOT apply the runConfig.workoutTypes
 * allowlist. Family order is first-seen; variants within each family are sorted by
 * sortOrder ascending (Standard before Longer).
 */
export function pickerRecordsForRun(
  variants: WorkoutVariantRow[],
  runConfig: RunConfig,
): PickerRecord[] {
  const filtered = runConfig.runGroupId != null
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
