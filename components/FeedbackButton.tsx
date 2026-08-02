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
        className="w-9 h-9 flex-none flex items-center justify-center rounded-full border border-[#e8eaef] bg-white text-[#8b93a1] touch-manipulation"
        title="Feedback"
        data-tour="feedback"
      >
        <FeedbackIcon size={17} />
      </button>
      <FeedbackDrawer open={open} onClose={() => setOpen(false)} />
    </>
  )
}
