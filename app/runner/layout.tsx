import type { ReactNode } from 'react'
import RunnerNav from '@/components/RunnerNav'

// Adds the runner bottom nav. Root layout's <main> + pb-20 already provides
// the scrollable container and space for the fixed nav bar.
export default function RunnerLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <RunnerNav />
    </>
  )
}
