import Link from 'next/link'
import { isDemoMode } from '@/lib/demo'

export default function DemoBanner() {
  if (!isDemoMode) return null
  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between gap-4">
      <p className="text-xs text-amber-800 font-medium leading-tight">
        Demo — explore freely. Nothing here is real data.
      </p>
      <Link
        href="/sign-in"
        className="shrink-0 text-xs font-semibold text-amber-900 underline underline-offset-2 touch-manipulation"
      >
        Log in as run leader →
      </Link>
    </div>
  )
}
