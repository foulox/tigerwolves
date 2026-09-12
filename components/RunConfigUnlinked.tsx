'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from './Header'

// Shown when a signed-in leader reaches /run-config but their account isn't
// linked to any run (#327). This is the state that previously bounced silently
// to Schedule. On a Preview/Development deployment it offers a one-click seed so
// the known test leaders can set themselves up without touching the database;
// in production it's purely diagnostic (a real unlinked leader is a data issue
// to fix by hand, never by a self-serve write).
export default function RunConfigUnlinked({ canSeed }: { canSeed: boolean }) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'seeding' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function seed() {
    setState('seeding')
    setMessage('')
    try {
      const res = await fetch('/api/preview-seed', { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setState('error')
        setMessage(body?.error ?? `Seed failed (${res.status})`)
        return
      }
      router.refresh()
    } catch (e) {
      setState('error')
      setMessage(e instanceof Error ? e.message : 'Seed request failed')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Run Settings" isLeader={true} showBack />
      <div className="mx-auto max-w-md px-4 py-10">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900">Your account isn&apos;t linked to a run</h2>
          <p className="mt-2 text-sm text-gray-600">
            You&apos;re signed in as a leader, but this environment&apos;s database has no run
            linked to your account — so there are no Run Settings to show yet.
          </p>
          {canSeed ? (
            <>
              <p className="mt-3 text-sm text-gray-600">
                This looks like a Preview. Set up the test runs and leader links for this
                deployment:
              </p>
              <button
                onClick={seed}
                disabled={state === 'seeding'}
                className="mt-4 w-full touch-manipulation rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {state === 'seeding' ? 'Setting up…' : 'Set up this preview'}
              </button>
              {state === 'error' && (
                <p className="mt-3 text-sm text-red-600">{message}</p>
              )}
            </>
          ) : (
            <p className="mt-3 text-sm text-gray-600">
              Ask an admin to link your account to a run.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
