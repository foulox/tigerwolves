'use client'

// Story 1A: the Filters button carries the active-filter summary inline (Model C
// decision: no separate chip row). Reads "Filters" when nothing is active.
export default function FiltersButton({
  count, summary, onOpen,
}: {
  count: number
  summary: string
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={count > 0 ? `Filters, ${count} active` : 'Filters'}
      className={`flex items-center gap-2 min-w-0 max-w-full border px-3 py-2 touch-manipulation font-display uppercase tracking-[0.08em] text-[11px] font-medium text-ink ${count > 0 ? 'border-ink' : 'border-line'}`}
    >
      <span className="truncate">{summary ? `Filters · ${summary}` : 'Filters'}</span>
      {count > 0 && (
        <span className="shrink-0 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-link text-black text-[10px] font-semibold">
          {count}
        </span>
      )}
    </button>
  )
}
