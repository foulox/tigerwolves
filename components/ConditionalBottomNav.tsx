'use client'

import { usePathname } from 'next/navigation'
import BottomNav from './BottomNav'
import TourMount from './TourMount'

type Props = { isLeader: boolean }

// Suppresses the TigerWolves BottomNav and tour on /runner/* routes.
// RunnerNav is rendered by app/runner/layout.tsx instead.
export default function ConditionalBottomNav({ isLeader }: Props) {
  const pathname = usePathname()
  if (pathname.startsWith('/runner')) return null
  return (
    <>
      <TourMount isLeader={isLeader} />
      <BottomNav />
    </>
  )
}
