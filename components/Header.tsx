'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import { Settings } from 'lucide-react'
import HowToUseButton from './HowToUseButton'
import WhatsNewOverlay from './WhatsNewOverlay'
import FeedbackButton from './FeedbackButton'
import { PersonIcon } from './icons'

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
        <h1 className="text-2xl font-extrabold text-gray-900 tracking-[-0.01em]">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2.5">
        <WhatsNewOverlay />
        <HowToUseButton />
        {isLeader ? (
          <UserButton appearance={{ elements: { userButtonAvatarBox: 'w-10 h-10' } }}>
            <UserButton.MenuItems>
              <UserButton.Link label="Admin" href="/admin" labelIcon={<Settings size={16} />} />
            </UserButton.MenuItems>
          </UserButton>
        ) : (
          <Link
            href={`/sign-in?redirect_url=${encodeURIComponent(pathname)}`}
            title="Sign in"
            className="w-10 h-10 flex-none rounded-full bg-[#e8eaef] flex items-center justify-center text-[#8b93a1] touch-manipulation"
          >
            <PersonIcon size={22} />
          </Link>
        )}
        <FeedbackButton />
      </div>
    </header>
  )
}
