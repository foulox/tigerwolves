'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Menu, Settings, Wrench } from 'lucide-react'

// Leader-only nav for the pages that don't belong in the bottom nav:
// Run Settings and Admin. Rendered by Header.tsx only when isLeader is true.
const ITEMS = [
  { href: '/run-config', label: 'Run Settings', Icon: Settings },
  { href: '/admin', label: 'Admin', Icon: Wrench },
]

export default function LeaderMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on any pointer-down outside the menu (tap-away on mobile, click on desktop).
  useEffect(() => {
    if (!open) return
    function onDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Leader menu"
        aria-expanded={open}
        className="w-10 h-10 flex-none rounded-full bg-[#e8eaef] flex items-center justify-center text-gray-700 touch-manipulation"
      >
        <Menu size={22} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-52 z-40 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden"
        >
          {ITEMS.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-900 hover:bg-gray-50 border-b border-gray-50 last:border-0 touch-manipulation"
            >
              <Icon size={18} className="text-gray-500" />
              {label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
