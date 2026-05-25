'use client'

import { useState, useRef, useTransition } from 'react'
import { X, Bug, Lightbulb, Image, ExternalLink, Loader2 } from 'lucide-react'
import { createFeedbackIssue } from '@/app/actions'

type Props = {
  open: boolean
  onClose: () => void
}

export default function FeedbackDrawer({ open, onClose }: Props) {
  const [type, setType] = useState<'bug' | 'feature'>('bug')
  const [description, setDescription] = useState('')
  const [screenshotBase64, setScreenshotBase64] = useState<string | undefined>()
  const [screenshotName, setScreenshotName] = useState<string | undefined>()
  const [issueUrl, setIssueUrl] = useState<string | undefined>()
  const [errorMsg, setErrorMsg] = useState<string | undefined>()
  const [isPending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  function reset() {
    setType('bug')
    setDescription('')
    setScreenshotBase64(undefined)
    setScreenshotName(undefined)
    setIssueUrl(undefined)
    setErrorMsg(undefined)
  }

  function handleClose() {
    reset()
    onClose()
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setScreenshotName(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      setScreenshotBase64(result.split(',')[1])
    }
    reader.readAsDataURL(file)
  }

  function handleSubmit() {
    if (!description.trim()) return
    setErrorMsg(undefined)
    startTransition(async () => {
      const result = await createFeedbackIssue({ type, description: description.trim(), screenshotBase64 })
      if ('error' in result) {
        setErrorMsg(result.error)
      } else {
        setIssueUrl(result.url)
      }
    })
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={handleClose}>
      <div
        className="w-full bg-white rounded-t-2xl shadow-xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Send Feedback</h2>
          <button onClick={handleClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {issueUrl ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 py-10 text-center">
            <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center">
              <svg className="w-7 h-7 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-gray-900">Feedback submitted</p>
              <p className="text-sm text-gray-500 mt-1">GitHub issue created</p>
            </div>
            <a
              href={issueUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-blue-600 font-medium"
            >
              View issue <ExternalLink size={14} />
            </a>
            <button
              onClick={handleClose}
              className="mt-2 px-5 py-2 rounded-xl bg-gray-100 text-sm font-medium text-gray-700"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
            <div className="flex gap-2">
              <button
                onClick={() => setType('bug')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                  type === 'bug' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-gray-50 border-gray-200 text-gray-500'
                }`}
              >
                <Bug size={16} />
                Bug report
              </button>
              <button
                onClick={() => setType('feature')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                  type === 'feature' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-500'
                }`}
              >
                <Lightbulb size={16} />
                Feature request
              </button>
            </div>

            <textarea
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300"
              rows={5}
              placeholder={type === 'bug' ? 'What happened? What did you expect?' : 'What would you like to see?'}
              value={description}
              onChange={e => setDescription(e.target.value)}
            />

            <div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
              {screenshotName ? (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Image size={15} className="text-gray-400" />
                  <span className="flex-1 truncate">{screenshotName}</span>
                  <button
                    onClick={() => { setScreenshotBase64(undefined); setScreenshotName(undefined) }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
                >
                  <Image size={15} />
                  Attach screenshot (optional)
                </button>
              )}
            </div>

            {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

            <button
              onClick={handleSubmit}
              disabled={!description.trim() || isPending}
              className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {isPending && <Loader2 size={15} className="animate-spin" />}
              {isPending ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
