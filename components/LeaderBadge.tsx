'use client'

import { UserButton } from '@clerk/nextjs'

export default function LeaderBadge({ isLeader }: { isLeader: boolean }) {
  if (!isLeader) return null
  return (
    <div className="absolute top-4 right-4 z-10">
      <UserButton />
    </div>
  )
}
