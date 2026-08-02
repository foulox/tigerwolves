'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import { Settings } from 'lucide-react'
import HowToUseButton from './HowToUseButton'
import WhatsNewOverlay from './WhatsNewOverlay'
import FeedbackButton from './FeedbackButton'

export default function Header({
  title,
  subtitle,
  isLeader,
}: {
  title: string
  subtitle?: string
  isLeader: boolean
}) {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-30 bg-gray-50 px-4 pt-10 pb-4 flex items-start justify-between">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
        <WhatsNewOverlay />
        <HowToUseButton />
        {isLeader ? (
          <UserButton>
            <UserButton.MenuItems>
              <UserButton.Link label="Admin" href="/admin" labelIcon={<Settings size={16} />} />
            </UserButton.MenuItems>
          </UserButton>
        ) : (
          <Link
            href={`/sign-in?redirect_url=${encodeURIComponent(pathname)}`}
            className="text-xs text-gray-400 touch-manipulation"
          >
            Sign in
          </Link>
        )}
        <FeedbackButton />
      </div>
    </header>
  )
}
