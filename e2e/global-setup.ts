import { clerkSetup } from '@clerk/testing/playwright'
import { seedE2E } from '../scripts/seed-e2e'

export default async function globalSetup() {
  // Fetches a Clerk testing token so auth.setup.ts's sign-in can bypass
  // Device Trust's "new device" email-verification step — see #273. Throws
  // if CLERK_SECRET_KEY resolves to a production instance, which is the
  // same production/staging guard scripts/seed-e2e.ts already enforces.
  await clerkSetup()
  await seedE2E()
}
