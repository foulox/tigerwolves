'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, BookOpen, Flag, Map, List } from 'lucide-react'
import { ClipboardCheckIcon } from './icons'

// #332 Home flip — the single app nav for everyone (runners + leaders). The old
// standalone Schedule tab retired into the run-scoped page; My Week is home. The
// Plan tab is leader-only and gated on the server-computed `isLeader` prop, NOT
// client `isSignedIn` — a signed-in runner must not see Plan.
const allTabs = [
  { href: '/my-week',  label: 'My Week',  icon: CalendarDays,       tour: 'my-week',  leaderOnly: false },
  { href: '/plan',     label: 'Plan',     icon: ClipboardCheckIcon, tour: 'plan',     leaderOnly: true  },
  { href: '/all-runs', label: 'All Runs', icon: List,               tour: 'all-runs', leaderOnly: false },
  { href: '/library',  label: 'Library',  icon: BookOpen,           tour: 'library',  leaderOnly: false },
  { href: '/races',    label: 'Races',    icon: Flag,               tour: 'races',    leaderOnly: false },
  { href: '/roadmap',  label: 'Roadmap',  icon: Map,                tour: 'roadmap',  leaderOnly: false },
]

type Props = { isLeader: boolean }

export default function BottomNav({ isLeader }: Props) {
  const pathname = usePathname()
  const tabs = allTabs.filter(t => !t.leaderOnly || isLeader)
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex safe-area-inset-bottom">
      {tabs.map(({ href, label, icon: Icon, tour }) => {
        const active = pathname === href
        return (
          <Link
            key={href}
            href={href}
            data-tour={tour}
            aria-label={label}
            className={`flex-1 flex flex-col items-center py-3 gap-1 text-xs font-medium transition-colors touch-manipulation ${active ? 'text-orange-500' : 'text-gray-400'}`}
          >
            <Icon size={22} strokeWidth={active ? 2.5 : 1.75} />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
