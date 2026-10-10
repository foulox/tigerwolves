'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { UserButton, useUser } from '@clerk/nextjs'
import { ChevronLeft, Settings, Wrench } from 'lucide-react'
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
  const { isLoaded, isSignedIn } = useUser()

  return (
    <header className="sticky top-0 z-30 bg-chrome px-4 pt-4 pb-3 mb-3">
      {/* Top brand row: logo left, controls right */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {showBack && (
            <button
              onClick={() => router.back()}
              aria-label="Go back"
              className="text-accent touch-manipulation"
            >
              <ChevronLeft size={24} strokeWidth={2.5} />
            </button>
          )}
          <img
            src="/nbr-logo.png"
            alt="North Brooklyn Runners"
            className="h-8 w-auto"
          />
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
                </UserButton.MenuItems>
              </UserButton>
            ) : (
              <Link
                href={`/sign-in?redirect_url=${encodeURIComponent(pathname)}`}
                title="Sign in"
                aria-label="Sign in"
                className="w-10 h-10 flex-none rounded-full bg-white/10 flex items-center justify-center text-chrome-muted touch-manipulation"
              >
                <PersonIcon size={22} />
              </Link>
            ))}
          <FeedbackButton />
        </div>
      </div>
      {/* Page title / subtitle row */}
      <div>
        <h1 className="text-2xl font-extrabold text-chrome-text tracking-[-0.01em]">{title}</h1>
        {subtitle && <p className="text-sm text-chrome-muted mt-0.5">{subtitle}</p>}
      </div>
    </header>
  )
}
