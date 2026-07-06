'use client'

import { useEffect } from 'react'
import { initAnalytics } from '@/lib/analyticsClient'

export default function PostHogInit({ isLeader }: { isLeader: boolean }) {
  useEffect(() => {
    initAnalytics(isLeader)
  }, [isLeader])

  return null
}
