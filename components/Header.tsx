'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { UserButton, useUser } from '@clerk/nextjs'
import { ChevronLeft, Settings, Wrench, Plus, Zap } from 'lucide-react'
import FeedbackButton from './FeedbackButton'
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
  const { user, isLoaded, isSignedIn } = useUser()
  const isAdmin = user?.publicMetadata?.admin === true

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
        {/* Onboarding tour + What's New entry points were removed in #372 (interim
            mitigation — stale/broken while onboarding moves to in-person coffee).
            The OnboardingTour / WhatsNewOverlay components remain in the repo as
            reference for the rebuild (epic #371). */}
        {/* Render only once Clerk has resolved auth state, so a signed-in user never
            briefly sees the sign-in link (which would bounce them back — the #366 bug).
            Any signed-in user gets the UserButton (Clerk's built-in Sign Out / Manage
            Account); leader/admin links are conditional inside. */}
        {isLoaded &&
          (isSignedIn ? (
            <UserButton appearance={{ elements: { userButtonAvatarBox: "w-10 h-10" } }}>
              <UserButton.MenuItems>
                {isLeader && (
                  <UserButton.Link label="Run Settings" labelIcon={<Settings size={16} />} href="/run-config" />
                )}
                {isLeader && (
                  <UserButton.Link label="Edit Workouts" labelIcon={<Wrench size={16} />} href="/admin" />
                )}
                {isAdmin && (
                  <UserButton.Link label="Create a Run" labelIcon={<Plus size={16} />} href="/admin/create-run" />
                )}
                {isAdmin && (
                  <UserButton.Link label="Activate an NBR Run" labelIcon={<Zap size={16} />} href="/admin/activate-run" />
                )}
              </UserButton.MenuItems>
            </UserButton>
          ) : (
            <Link
              href={`/sign-in?redirect_url=${encodeURIComponent(pathname)}`}
              title="Sign in"
              aria-label="Sign in"
              className="w-10 h-10 flex-none rounded-full bg-[#e8eaef] flex items-center justify-center text-[#8b93a1] touch-manipulation"
            >
              <PersonIcon size={22} />
            </Link>
          ))}
        <FeedbackButton />
      </div>
    </header>
  )
}
