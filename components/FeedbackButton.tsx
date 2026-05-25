'use client'

import { useState } from 'react'
import { MessageSquare } from 'lucide-react'
import FeedbackDrawer from './FeedbackDrawer'

export default function FeedbackButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 text-gray-400 touch-manipulation"
        title="Send feedback"
      >
        <MessageSquare size={15} />
      </button>
      <FeedbackDrawer open={open} onClose={() => setOpen(false)} />
    </>
  )
}
