'use client'

import { useState, useTransition } from 'react'
import { deleteWorkout } from '@/app/actions'

export default function DeleteWorkoutButton({ name, variation }: { name: string; variation: string }) {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    setError('')
    startTransition(async () => {
      try {
        await deleteWorkout(name, variation)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Delete failed')
        setConfirming(false)
      }
    })
  }

  if (confirming) {
    return (
      <div className="flex flex-col gap-1.5 items-end">
        <p className="text-xs text-red-600 font-semibold">Delete this workout?</p>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="text-xs px-3 py-1 rounded-full border border-gray-200 text-gray-600 touch-manipulation"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="text-xs px-3 py-1 rounded-full bg-red-500 text-white font-semibold disabled:opacity-40 touch-manipulation"
          >
            {isPending ? 'Deleting…' : 'Yes, delete'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="w-7 h-7 flex items-center justify-center rounded-full border border-gray-200 text-gray-400 text-xs touch-manipulation"
      title="Delete workout"
    >
      🗑
    </button>
  )
}
