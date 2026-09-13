import { NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { isSeedAllowed } from '@/lib/seedFixtures'

// scripts/seed-e2e.ts writes fixture rows with raw SQL, bypassing the app
// entirely — so fetchData's unstable_cache (lib/db.ts) has no way to know the
// underlying data changed, and can keep serving a previous run's cached
// result for up to its 5-minute revalidate window. e2e/auth.setup.ts calls
// this once, right after the seed has landed and the server is confirmed up,
// so every e2e run starts from the same cache-invalidation path a real
// Server Action write would take (see revalidateAll() in app/actions.ts).
//
// Reachable on any non-production deployment (preview/development, including
// the demo at demo.tigerwolves.foulox.me), hard-off on production. Its only
// side effect is cache invalidation — no data write, no auth bypass — so
// preview reachability is safe. VERCEL_ENV is unset in CI e2e (next start
// runs outside Vercel), which isSeedAllowed treats as allowed, so the
// existing e2e suite keeps working without any separate bypass.
//
// updateTag (the primitive revalidateAll() uses) only works inside a Server
// Action — Route Handlers get a hard runtime error naming revalidateTag as
// the replacement, which in this Next.js version needs a second cache-life
// profile argument (see CLAUDE.md's cache-invalidation guardrail).
export async function POST() {
  if (!isSeedAllowed(process.env.VERCEL_ENV)) {
    return NextResponse.json({ error: 'not available in production' }, { status: 403 })
  }
  revalidatePath('/', 'layout')
  revalidateTag('tigerwolves-data', 'max')
  return NextResponse.json({ ok: true })
}
