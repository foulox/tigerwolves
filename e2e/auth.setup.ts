import { test as setup, expect } from '@playwright/test'
import { clerk } from '@clerk/testing/playwright'
import fs from 'fs'
import path from 'path'

const authFile = path.join(__dirname, '.auth/user.json')

setup('authenticate as test leader', async ({ page }) => {
  const email = process.env.PLAYWRIGHT_TEST_EMAIL
  if (!email) throw new Error('PLAYWRIGHT_TEST_EMAIL must be set in .env.test')

  // Signs in via a Backend-API-minted ticket instead of password + Device Trust.
  // Device Trust only gates *password* sign-ins, and @clerk/testing's password
  // strategy doesn't check signIn.create()'s status before calling setActive() —
  // when Device Trust requires extra verification, createdSessionId comes back
  // undefined and setActive() silently no-ops, so no error surfaces but no
  // session cookie is ever set either. Ticket-based sign-in (clerk.signIn with
  // emailAddress) uses CLERK_SECRET_KEY to mint a sign-in ticket directly via
  // the Backend API and redeems it client-side — no password, no Device Trust
  // check. See #273.
  await page.goto('/')
  await clerk.signIn({ page, emailAddress: email })

  await page.goto('/')
  fs.mkdirSync(path.dirname(authFile), { recursive: true })
  await page.context().storageState({ path: authFile })

  // scripts/seed-e2e.ts writes with raw SQL, which fetchData's unstable_cache
  // (lib/db.ts) has no way to know about — without this, pages can keep
  // serving a previous run's cached result for up to 5 minutes. See
  // app/api/e2e-revalidate/route.ts.
  const revalidateResponse = await page.request.post('/api/e2e-revalidate')
  expect(revalidateResponse.ok(), `e2e-revalidate failed: ${revalidateResponse.status()}`).toBe(true)
})
