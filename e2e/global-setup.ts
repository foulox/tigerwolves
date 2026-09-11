import { clerkSetup } from '@clerk/testing/playwright'
import { seedE2E } from '../scripts/seed-e2e'

export default async function globalSetup() {
  // Fetches a Clerk testing token so auth.setup.ts's sign-in can bypass
  // Device Trust's "new device" email-verification step — see #273. Throws
  // if CLERK_SECRET_KEY resolves to a production instance, which is the
  // same production/staging guard scripts/seed-e2e.ts already enforces.
  await clerkSetup()
  await seedE2E()

  // Invalidate fetchData's unstable_cache so tests see the freshly seeded rows.
  // The webServer is already running at this point (Playwright starts it before
  // calling globalSetup). In CI, next build && next start is used, so all routes
  // are pre-compiled — no first-request compilation delay to worry about here.
  const res = await fetch('http://localhost:3000/api/e2e-revalidate', { method: 'POST' })
  if (!res.ok) throw new Error(`e2e-revalidate failed with status ${res.status}`)
}
