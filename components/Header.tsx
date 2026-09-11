'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import { ChevronLeft } from 'lucide-react'
import HowToUseButton from './HowToUseButton'
import WhatsNewOverlay from './WhatsNewOverlay'
import FeedbackButton from './FeedbackButton'
import LeaderMenu from './LeaderMenu'
import { PersonIcon } from './icons'

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
  const pathname = usePathname()
  const router = useRouter()

  return (
    <header className="sticky top-0 z-30 bg-gray-50 px-4 pt-10 pb-4 flex items-start justify-between">
      <div className="flex items-start gap-2">
        {showBack && (
          <button
            onClick={() => router.back()}
            aria-label="Go back"
            className="mt-1 text-orange-600 touch-manipulation"
          >
            <ChevronLeft size={28} strokeWidth={2.5} />
          </button>
        )}
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-[-0.01em]">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <WhatsNewOverlay />
        <HowToUseButton />
        {isLeader ? (
          <>
            <LeaderMenu />
            <UserButton appearance={{ elements: { userButtonAvatarBox: 'w-10 h-10' } }} />
          </>
        ) : (
          <Link
            href={`/sign-in?redirect_url=${encodeURIComponent(pathname)}`}
            title="Sign in"
            aria-label="Sign in"
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
