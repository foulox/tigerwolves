'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, List, BookOpen, Flag, ClipboardList } from 'lucide-react'

const tabs = [
  { href: '/runner',          label: 'My Week',  icon: CalendarDays  },
  { href: '/plan',            label: 'Plan',     icon: ClipboardList },
  { href: '/runner/all-runs', label: 'All Runs', icon: List          },
  { href: '/library',         label: 'Library',  icon: BookOpen      },
  { href: '/races',           label: 'Races',    icon: Flag          },
]

export default function RunnerNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex safe-area-inset-bottom z-10">
      {tabs.map(({ href, label, icon: Icon }) => {
        const isActive = href === '/runner'
          ? pathname === '/runner' || (pathname.startsWith('/runner/') && !pathname.startsWith('/runner/all-runs'))
          : pathname === href
        return (
          <Link
            key={href}
            href={href}
            aria-label={label}
            className={`flex-1 flex flex-col items-center py-3 gap-1 text-xs font-medium transition-colors touch-manipulation ${isActive ? 'text-orange-500' : 'text-gray-400'}`}
          >
            <Icon size={22} strokeWidth={isActive ? 2.5 : 1.75} />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
