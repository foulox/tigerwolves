'use client'

import type { RatingThreshold } from '@/lib/rating'

// Story #241: the shared rating filter dropdown, reused by ScheduleClient and
// LibraryClient. Presentational — the selected threshold lives in each client's
// own useState. Filters on the raw average (see passesRatingThreshold); no
// minimum vote count.
export const RATING_FILTER_OPTIONS: { value: RatingThreshold; label: string }[] = [
  { value: 'any', label: 'Any rating' },
  { value: 'ok', label: '😐 & up' },
  { value: 'good', label: '😃 & up' },
  { value: 'love', label: '🥳 only' },
]

export default function RatingFilter({
  value,
  onChange,
  className = '',
}: {
  value: RatingThreshold
  onChange: (t: RatingThreshold) => void
  className?: string
}) {
  return (
    <select
      aria-label="Filter by rating"
      value={value}
      onChange={e => onChange(e.target.value as RatingThreshold)}
      className={`text-xs font-semibold rounded-full border border-line bg-card px-3 py-1.5 touch-manipulation ${className}`}
    >
      {RATING_FILTER_OPTIONS.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}
