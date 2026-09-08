'use client'
import { useState, useTransition } from 'react'
import * as Sentry from '@sentry/nextjs'
import { savePostTemplate } from '@/app/run-config/actions'
import type { RunConfig } from '@/lib/data'

export default function PostTemplateTab({ runConfig }: { runConfig: RunConfig }) {
  const [form, setForm] = useState({
    postHeader: runConfig.postHeader,
    meetingLocation: runConfig.meetingLocation,
    leaderIntro: runConfig.leaderIntro,
    closingNotes: runConfig.closingNotes,
  })
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      try {
        const result = await savePostTemplate(form)
        if (result.error) { setError(result.error); return }
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } catch (err) {
        Sentry.captureException(err)
        setError('Something went wrong')
      }
    })
  }

  const field = (label: string, key: keyof typeof form, multiline = false) => (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{label}</label>
      {multiline ? (
        <textarea
          value={form[key]}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 resize-none min-h-[60px] touch-manipulation"
        />
      ) : (
        <input
          type="text"
          value={form[key]}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 touch-manipulation"
        />
      )}
    </div>
  )

  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="bg-white rounded-xl p-4 flex flex-col gap-3 shadow-sm">
        {field('Post header', 'postHeader', true)}
        {field('Meeting location', 'meetingLocation', true)}
        {field('Leader intro', 'leaderIntro')}
        {field('Closing notes', 'closingNotes', true)}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          onClick={handleSave}
          disabled={isPending}
          className="bg-orange-600 text-white rounded-xl py-3 font-bold text-sm disabled:opacity-50 touch-manipulation"
        >
          {saved ? 'Saved!' : isPending ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}
