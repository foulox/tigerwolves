'use client'

import { useState, useTransition } from 'react'
import * as Sentry from '@sentry/nextjs'
import { adoptRoute, unadoptRoute } from '@/app/actions'

type LedRun = { id: string; name: string }

/**
 * #404: per-family adopt / un-adopt affordance shown on Library cards.
 *
 * - "All runs" mode, a route NOT in the run's library → **[+ Add to my run]**. A
 *   single-run leader adopts straight into their run; a multi-run leader first picks
 *   which of their runs to adopt into (AC6). Optimistic-feeling via useTransition.
 * - "Your run" mode, an ADOPTED route (in the library but created by another run) →
 *   an "adopted from <creator>" note + **[Remove from my run]** (un-adopt — membership
 *   only, NEVER a global delete; that stays the separate 🗑 Delete control, AC7).
 * - A route the run CREATED shows nothing here (its normal edit/delete already apply).
 *
 * Every server-action call is wrapped in try/catch + Sentry.captureException per the
 * project guardrail — an unguarded throw would trip global-error.tsx.
 */
export default function AdoptRouteControls({
  familyId,
  creatorRunGroupId,
  myRunGroupId,
  runGroupNames,
  inLibrary,
  showAllRuns,
  ledRuns,
  primaryRunId,
}: {
  familyId: number
  creatorRunGroupId: number | null
  myRunGroupId: number | null
  runGroupNames: Record<number, string>
  inLibrary: boolean
  showAllRuns: boolean
  ledRuns: LedRun[]
  primaryRunId: string
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [pickingRun, setPickingRun] = useState(false)

  const isAdopted = inLibrary && creatorRunGroupId != null && creatorRunGroupId !== myRunGroupId
  const creatorName = creatorRunGroupId != null ? runGroupNames[creatorRunGroupId] : undefined

  function doAdopt(runId: string) {
    setError('')
    setPickingRun(false)
    startTransition(async () => {
      try {
        const res = await adoptRoute(runId, familyId)
        if (res?.error) setError(res.error)
      } catch (err) {
        Sentry.captureException(err)
        setError('Failed to add route to your run')
      }
    })
  }

  function doRemove() {
    setError('')
    startTransition(async () => {
      try {
        const res = await unadoptRoute(primaryRunId, familyId)
        if (res?.error) setError(res.error)
      } catch (err) {
        Sentry.captureException(err)
        setError('Failed to remove route from your run')
      }
    })
  }

  // "Your run" → an adopted route: creator note + Remove. (Created routes render nothing.)
  if (!showAllRuns) {
    if (!isAdopted) return null
    return (
      <div className="mt-1.5 px-1 flex items-center justify-between gap-2">
        <span className="text-xs text-gray-400 italic">
          adopted{creatorName ? ` from ${creatorName}` : ''}
        </span>
        <div className="flex flex-col items-end gap-0.5">
          <button
            type="button"
            onClick={doRemove}
            disabled={isPending}
            className="text-xs font-semibold text-gray-500 border border-gray-200 rounded-full px-3 py-1 disabled:opacity-40 touch-manipulation"
          >
            {isPending ? 'Removing…' : 'Remove from my run'}
          </button>
          {error && <span className="text-xs text-red-500">{error}</span>}
        </div>
      </div>
    )
  }

  // "All runs" → a route already in the library needs no add affordance.
  if (inLibrary) return null

  // "All runs" → offer to add. Multi-run leaders pick a target run first.
  return (
    <div className="mt-1.5 px-1 flex flex-col items-end gap-1">
      {pickingRun ? (
        <div className="flex flex-col items-end gap-1">
          <span className="text-xs text-gray-500 font-semibold">Add to which run?</span>
          <div className="flex flex-wrap gap-1.5 justify-end">
            {ledRuns.map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => doAdopt(r.id)}
                disabled={isPending}
                className="text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-200 rounded-full px-3 py-1 disabled:opacity-40 touch-manipulation"
              >
                {r.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPickingRun(false)}
              className="text-xs font-semibold text-gray-500 border border-gray-200 rounded-full px-3 py-1 touch-manipulation"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => (ledRuns.length > 1 ? setPickingRun(true) : doAdopt(ledRuns[0]?.id ?? primaryRunId))}
          disabled={isPending}
          className="text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-200 rounded-full px-3 py-1 disabled:opacity-40 touch-manipulation"
        >
          {isPending ? 'Adding…' : '+ Add to my run'}
        </button>
      )}
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  )
}
