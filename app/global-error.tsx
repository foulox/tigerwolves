'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html>
      <body className="flex items-center justify-center min-h-screen bg-gray-50 text-gray-900">
        <div className="text-center px-6">
          <p className="text-lg font-semibold">Something went wrong</p>
          <p className="text-sm text-gray-500 mt-1">The error has been reported. Try reloading the page.</p>
        </div>
      </body>
    </html>
  )
}
