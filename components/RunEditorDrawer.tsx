'use client'

import { useState, useEffect, useTransition } from 'react'
import { X, Loader2 } from 'lucide-react'
import { addDirectoryRun, editDirectoryRun } from '@/app/admin/actions'
import { DAYS_OF_WEEK } from '@/lib/runIdentity'
import type { NBRCategory } from '@/lib/runProfile'

const NBR_CATEGORIES: NBRCategory[] = [
  'Beginner-Friendly',
  'Easy Runs',
  'Long Runs',
  'Food Runs',
  'Workouts',
]

type Props = {
  open: boolean
  onClose: () => void
  onSaved: () => void
  mode: 'add' | 'edit'
  initial?: {
    runId: string
    name: string
    day: string
    time: string
    location: string
    distance: string
    category: NBRCategory
  }
}

export default function RunEditorDrawer({ open, onClose, onSaved, mode, initial }: Props) {
  const [name, setName] = useState('')
  const [day, setDay] = useState<string>(DAYS_OF_WEEK[0])
  const [time, setTime] = useState('')
  const [location, setLocation] = useState('')
  const [distance, setDistance] = useState('')
  const [category, setCategory] = useState<NBRCategory>('Workouts')
  const [errorMsg, setErrorMsg] = useState<string | undefined>()
  const [isPending, startTransition] = useTransition()

  // Re-seed when initial or open changes (handles reopening on a different card)
  useEffect(() => {
    if (mode === 'edit' && initial) {
      setName(initial.name)
      setDay(initial.day)
      setTime(initial.time)
      setLocation(initial.location)
      setDistance(initial.distance)
      setCategory(initial.category)
    } else if (mode === 'add') {
      reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // `mode` intentionally omitted: callers always change `open`/`initial` when switching modes/cards,
    // so this effect re-seeds correctly without it. `reset` omitted: stable function, no captured state.
  }, [initial, open])

  function reset() {
    setName('')
    setDay(DAYS_OF_WEEK[0])
    setTime('')
    setLocation('')
    setDistance('')
    setCategory('Workouts')
    setErrorMsg(undefined)
  }

  function handleClose() {
    reset()
    onClose()
  }

  function handleSave() {
    setErrorMsg(undefined)
    const fields = { name, day, time, location, distance, category }
    startTransition(async () => {
      const result =
        mode === 'add'
          ? await addDirectoryRun(fields)
          : await editDirectoryRun(initial!.runId, fields)
      if (result.error) {
        setErrorMsg(result.error)
      } else {
        onSaved()
        handleClose()
      }
    })
  }

  if (!open) return null

  const title = mode === 'add' ? 'Add run' : `Edit: ${initial?.name ?? 'run'}`

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/35" onClick={handleClose}>
      <div
        className="fixed inset-x-0 bottom-0 rounded-t-2xl bg-white shadow-xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            onClick={handleClose}
            className="p-1 text-gray-400 hover:text-gray-600 touch-manipulation"
            aria-label="Close drawer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Fields */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {/* Run name */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="run-editor-name"
              className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400"
            >
              Run name
            </label>
            <input
              id="run-editor-name"
              type="text"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-300"
              placeholder="e.g. Saturday Narwhals"
              value={name}
              onChange={e => setName(e.target.value)}
            />
            <span className="text-xs text-gray-400">Lead with the day — that&apos;s how the run&apos;s link id is built.</span>
          </div>

          {/* Day + Time row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label
                htmlFor="run-editor-day"
                className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400"
              >
                Day
              </label>
              <select
                id="run-editor-day"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-300"
                value={day}
                onChange={e => setDay(e.target.value)}
              >
                {DAYS_OF_WEEK.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor="run-editor-time"
                className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400"
              >
                Time
              </label>
              <input
                id="run-editor-time"
                type="text"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-300"
                placeholder="6:30am"
                value={time}
                onChange={e => setTime(e.target.value)}
              />
            </div>
          </div>

          {/* Location */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="run-editor-location"
              className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400"
            >
              Location
            </label>
            <input
              id="run-editor-location"
              type="text"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-300"
              placeholder="McCarren Park"
              value={location}
              onChange={e => setLocation(e.target.value)}
            />
          </div>

          {/* Distance + Category row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label
                htmlFor="run-editor-distance"
                className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400"
              >
                Distance
              </label>
              <input
                id="run-editor-distance"
                type="text"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-300"
                placeholder="4–7 mi"
                value={distance}
                onChange={e => setDistance(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor="run-editor-category"
                className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400"
              >
                Category
              </label>
              <select
                id="run-editor-category"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-300"
                value={category}
                onChange={e => setCategory(e.target.value as NBRCategory)}
              >
                {NBR_CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          {errorMsg && (
            <p className="text-sm text-red-600">{errorMsg}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex flex-col gap-3">
          <button
            onClick={handleSave}
            disabled={!name.trim() || isPending}
            className="w-full py-3 rounded-xl bg-orange-500 text-white text-sm font-extrabold disabled:opacity-40 flex items-center justify-center gap-2 touch-manipulation"
          >
            {isPending && <Loader2 size={15} className="animate-spin" />}
            {isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
