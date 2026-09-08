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
  // Moved here from auth.setup.ts: the first request to this route handler
  // triggers Next.js compilation in CI, which can take 60s+ — longer than the
  // per-test timeout. globalSetup has no per-test timeout, so it's safe here.
  // The webServer is already running at this point (Playwright starts it before
  // calling globalSetup).
  const res = await fetch('http://localhost:3000/api/e2e-revalidate', { method: 'POST' })
  if (!res.ok) throw new Error(`e2e-revalidate failed with status ${res.status}`)
}
