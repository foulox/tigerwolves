import Link from 'next/link'

export const metadata = { title: 'Offline — TigerWolves' }

// #465 Story B — navigation fallback. Must render with ZERO network: no data
// fetch, no dynamic server work. Copy makes clear it is THIS page that needs
// signal, and lists the pages that still work offline.
export default function OfflinePage() {
  const cached = [
    { href: '/all-runs', label: 'All Runs' },
    { href: '/library', label: 'Library' },
    { href: '/races', label: 'Races' },
  ]
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <div className="text-5xl" aria-hidden="true">🐯🐺</div>
      <h1 className="text-2xl font-bold text-gray-900">You&apos;re offline</h1>
      <p className="text-gray-600">
        This page needs a connection. Reconnect to load it — the rest of the app you&apos;ve
        already opened still works offline.
      </p>
      <nav className="flex w-full flex-col gap-3">
        <p className="text-sm font-medium text-gray-500">These still work offline:</p>
        {cached.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="touch-manipulation rounded-lg bg-orange-500 px-4 py-3 font-semibold text-white"
          >
            {c.label}
          </Link>
        ))}
      </nav>
    </main>
  )
}
