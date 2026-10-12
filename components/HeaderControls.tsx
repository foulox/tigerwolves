'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserButton, useUser } from '@clerk/nextjs'
import { Settings, Wrench } from 'lucide-react'
import FeedbackButton from './FeedbackButton'
import { PersonIcon } from './icons'

// #513: extracted from Header so the hero mastheads and the compact utility Header
// render the identical account/leader/feedback cluster — one behavioral contract,
// proven by header.spec.ts (/all-runs) and hero-masthead.spec.ts (/my-plan, /runs/[id]).
export default function HeaderControls({ isLeader }: { isLeader: boolean }) {
  const pathname = usePathname()
  const { isLoaded, isSignedIn } = useUser()

  return (
    <div className="flex items-center gap-2.5">
      {/* Render only once Clerk has resolved auth state, so a signed-in user never
          briefly sees the sign-in link (the #366 bounce bug). */}
      {isLoaded &&
        (isSignedIn ? (
          <UserButton appearance={{ elements: { userButtonAvatarBox: 'w-10 h-10' } }}>
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
  )
}
