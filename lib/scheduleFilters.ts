// Story 1B: summarizes the Schedule picker's active browse filters for the Filters
// button. The filtering itself stays in lib/schedulePicker.ts; this is display-only.
// typeLabel = the effective browse type in Your-run workout mode (the committed week
// type, or null when cleared to all types / non-workout). In All-runs mode it's null
// and browseCategory/browseType carry the narrowing. Mirrors lib/libraryFilters.ts.
export type ScheduleFilters = {
  showAllRuns: boolean
  typeLabel: string | null
  browseCategory: string | null
  browseType: string | null
}

function parts(f: ScheduleFilters): string[] {
  const p: string[] = []
  if (f.showAllRuns) {
    p.push('All runs')
    if (f.browseCategory) p.push(f.browseCategory)
    if (f.browseType) p.push(f.browseType)
  } else if (f.typeLabel) {
    p.push(f.typeLabel)
  }
  return p
}

export function scheduleFilterCount(f: ScheduleFilters): number {
  return parts(f).length
}

export function scheduleFilterSummary(f: ScheduleFilters): string {
  return parts(f).join(' · ')
}
