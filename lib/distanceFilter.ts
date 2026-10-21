// Story #461: the non-workout distance axis. A route's distanceMiles is nullable
// (null for workouts, or a non-workout route not yet imported). The range is only a
// filter once the leader narrows it — until then (null) every route shows, including
// distance-unknown ones, so missing data never silently hides a route.
export type DistRange = { min: number; max: number } | null

export function distanceBounds(rows: { distanceMiles: number | null }[]): { min: number; max: number } | null {
  const ds = rows.map(r => r.distanceMiles).filter((d): d is number => d != null)
  if (ds.length === 0) return null
  return { min: Math.floor(Math.min(...ds) * 10) / 10, max: Math.ceil(Math.max(...ds) * 10) / 10 }
}

export function applyDistanceRange<T extends { distanceMiles: number | null }>(rows: T[], range: DistRange): T[] {
  if (!range) return rows
  return rows.filter(r => r.distanceMiles != null && r.distanceMiles >= range.min && r.distanceMiles <= range.max)
}

export function distanceRangeSummary(range: DistRange): string {
  return range ? `${range.min.toFixed(1)}–${range.max.toFixed(1)} mi` : ''
}

// A set range is meaningful only while it still fits inside the current bounds. When the
// candidate pool shifts — a Library category switch (Long/Easy have different spans) or a
// text search narrowing the results — distanceBounds recomputes but the stored range does
// not. A range left outside the new bounds would silently drop every row and push the
// slider thumbs off the track; treat such a stale range as inactive (show all) instead.
export function activeRange(range: DistRange, bounds: { min: number; max: number } | null): DistRange {
  if (!range || !bounds) return null
  return range.min >= bounds.min && range.max <= bounds.max ? range : null
}
