'use client'

import Link from 'next/link'
import { UserButton } from '@clerk/nextjs'

export default function HeaderAuth({ isLeader }: { isLeader: boolean }) {
  if (isLeader) {
    return <UserButton />
  }
  return (
    <Link
      href="/sign-in?redirect_url=/plan"
      className="text-xs text-gray-400 touch-manipulation"
    >
      Sign in
    </Link>
  )
}
