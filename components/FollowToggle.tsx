'use client'

import { useState, useTransition } from 'react'
import { toggleRunFollow } from '@/app/run-config/actions'
import * as Sentry from '@sentry/nextjs'

export default function FollowToggle({
  runId,
  initialFollowing,
}: {
  runId: string
  initialFollowing: boolean
}) {
  const [following, setFollowing] = useState(initialFollowing)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  function handleToggle() {
    startTransition(async () => {
      try {
        setError('')
        const result = await toggleRunFollow(runId)
        if (result.error) {
          setError(result.error)
        } else {
          setFollowing(prev => !prev)
        }
      } catch (err) {
        Sentry.captureException(err)
        setError('Failed to update follow status')
      }
    })
  }

  if (error) {
    return (
      <button
        disabled
        className="text-xs font-semibold text-red-600 border border-red-300 rounded-full px-3 py-1 touch-manipulation"
        title={error}
      >
        Error
      </button>
    )
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      className={`text-xs font-semibold border rounded-full px-3 py-1 touch-manipulation disabled:opacity-50 ${
        following
          ? 'text-orange-700 border-orange-300 bg-orange-50'
          : 'text-gray-600 border-gray-300 bg-white'
      }`}
      title={following ? 'Unfollow this run' : 'Follow this run'}
    >
      {following ? 'Following ✓' : 'Follow'}
    </button>
  )
}
