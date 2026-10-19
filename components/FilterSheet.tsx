'use client'

import { useEffect } from 'react'

// Story 1A: bottom-sheet container for the filter facets. Presentational — the
// facet controls are passed as children by each client.
export default function FilterSheet({
  open, onClose, onClear, children,
}: {
  open: boolean
  onClose: () => void
  onClear: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-label="Filters" className="absolute left-0 right-0 bottom-0 bg-card border-t border-ink max-h-[86%] overflow-y-auto p-4 flex flex-col gap-4">
        {children}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClear} className="flex-1 font-display uppercase tracking-[0.1em] text-[11px] font-medium text-ink border border-line py-3 touch-manipulation">Clear all</button>
          <button type="button" onClick={onClose} className="flex-1 font-display uppercase tracking-[0.1em] text-[11px] font-medium text-white bg-ink border border-ink py-3 touch-manipulation">Show results</button>
        </div>
      </div>
    </div>
  )
}
