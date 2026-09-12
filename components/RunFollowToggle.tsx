'use client'

import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import { toggleRunFollow } from '@/app/actions'

// #330: join/leave toggle on a run's own page (/runs/[id] header). Mirrors the
// Join affordance on the All Runs surface (AllRunsClient) so the same action —
// writing runner_follows via toggleRunFollow — reads identically on both
// surfaces. Shown to any signed-in user; the server seeds the initial state.
export default function RunFollowToggle({
  runId,
  runName,
  initialFollowing,
}: {
  runId: string
  runName: string
  initialFollowing: boolean
}) {
  const [following, setFollowing] = useState(initialFollowing)
  const [pending, startTransition] = useTransition()

  function toggle() {
    startTransition(async () => {
      const res = await toggleRunFollow(runId)
      if (!res.error) setFollowing(res.following ?? !following)
    })
  }

  return (
    <button
      data-testid="run-follow-toggle"
      aria-label={following ? `Leave ${runName}` : `Join ${runName}`}
      onClick={toggle}
      disabled={pending}
      className={`text-[12.5px] font-bold rounded-full px-3.5 py-1.5 touch-manipulation disabled:opacity-50 whitespace-nowrap inline-flex items-center gap-1 ${
        following
          ? 'bg-green-100 text-green-800'
          : 'bg-orange-500 text-white shadow-sm'
      }`}
    >
      {following ? <><Check size={12} strokeWidth={3} /> Joined</> : '+ Join'}
    </button>
  )
}
