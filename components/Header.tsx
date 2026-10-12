'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import HeaderControls from './HeaderControls'

export default function Header({
  title,
  subtitle,
  isLeader,
  showBack,
}: {
  title: string
  subtitle?: string
  isLeader: boolean
  showBack?: boolean
}) {
  const router = useRouter()

  return (
    <header className="sticky top-0 z-30 bg-chrome px-4 pt-4 pb-3 mb-3">
      {/* Top brand row: logo left, controls right */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {showBack && (
            <button
              onClick={() => router.back()}
              aria-label="Go back"
              className="text-chrome-text touch-manipulation"
            >
              <ChevronLeft size={24} strokeWidth={2.5} />
            </button>
          )}
          <img src="/nbr-logo.png" alt="North Brooklyn Runners" className="h-7 w-auto" />
        </div>
        <HeaderControls isLeader={isLeader} />
      </div>
      {/* Page title / subtitle row */}
      <div>
        <h1 className="font-display text-3xl font-normal text-chrome-text">{title}</h1>
        {subtitle && (
          <p className="font-display uppercase tracking-[0.14em] text-[10px] text-chrome-muted mt-1">{subtitle}</p>
        )}
      </div>
    </header>
  )
}
