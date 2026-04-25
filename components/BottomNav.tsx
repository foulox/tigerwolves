'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, User, BookOpen, Flag } from 'lucide-react'

const tabs = [
  { href: '/', label: 'Schedule', icon: CalendarDays },
  { href: '/plan', label: 'Plan', icon: User },
  { href: '/library', label: 'Library', icon: BookOpen },
  { href: '/races', label: 'Races', icon: Flag },
]

export default function BottomNav() {
  const pathname = usePathname()
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex safe-area-inset-bottom">
      {tabs.map(({ href, label, icon: Icon }) => {
        const active = pathname === href
        return (
          <Link
            key={href}
            href={href}
            className={`flex-1 flex flex-col items-center py-3 gap-1 text-xs font-medium transition-colors ${active ? 'text-orange-500' : 'text-gray-400'}`}
          >
            <Icon size={22} strokeWidth={active ? 2.5 : 1.75} />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
