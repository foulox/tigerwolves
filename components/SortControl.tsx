'use client'

import { useState, useRef, useEffect } from 'react'

// Story 1A: the sort control shell — a trigger + popover menu. Generic over the
// sort value so Library (recent|rating) and later surfaces reuse it. Story 2 adds
// the ascending/descending direction toggle alongside this field selector.
export default function SortControl<T extends string>({
  value, options, onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = options.find(o => o.value === value)?.label ?? ''

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={`Change sort order, current: ${current}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        className="font-display uppercase tracking-[0.1em] text-[11px] font-medium text-ink border border-line px-3 py-1.5 touch-manipulation whitespace-nowrap"
      >
        {current} ▾
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-1 z-20 bg-card border border-ink min-w-[150px]">
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              role="menuitem"
              onClick={() => { onChange(o.value); setOpen(false) }}
              className={`block w-full text-left font-display uppercase tracking-[0.08em] text-[11px] px-3 py-2 touch-manipulation border-b border-line last:border-b-0 ${o.value === value ? 'bg-ink text-white' : 'text-ink'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
