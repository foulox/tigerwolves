'use client'

import { useState } from 'react'
import { FeedbackIcon } from './icons'
import FeedbackDrawer from './FeedbackDrawer'

export default function FeedbackButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-9 h-9 flex-none flex items-center justify-center rounded-full border border-white/10 bg-white/10 text-chrome-muted touch-manipulation"
        title="Feedback"
        aria-label="Feedback"
        data-tour="feedback"
      >
        <FeedbackIcon size={17} />
      </button>
      <FeedbackDrawer open={open} onClose={() => setOpen(false)} />
    </>
  )
}
