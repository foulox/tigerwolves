'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

// #513: back affordance for the Run Detail masthead brand row (prototype "← Back").
export default function BackButton() {
  const router = useRouter()
  return (
    <button
      onClick={() => router.back()}
      aria-label="Go back"
      className="flex items-center text-white touch-manipulation"
    >
      <ChevronLeft size={24} strokeWidth={2.5} />
    </button>
  )
}
