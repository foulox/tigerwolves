import { test as setup, expect } from '@playwright/test'
import { clerk } from '@clerk/testing/playwright'
import fs from 'fs'
import path from 'path'

const authFile = path.join(__dirname, '.auth/user.json')

setup('authenticate as test leader', async ({ page }) => {
  // CI renders '/' slowly (several sequential DB calls). 30s is too tight;
  // 90s gives the server room to breathe without letting a genuine hang hide.
  setup.setTimeout(90000)

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

  // clerk.signIn() navigates to /?__clerk_ticket=… then Clerk JS redeems it and
  // redirects to '/'. Wait for that natural redirect to land — do NOT issue a
  // competing page.goto('/') here, which races the ongoing redirect and produces
  // net::ERR_ABORTED ("maybe frame was detached") in CI.
  await page.waitForURL(url => !url.searchParams.has('__clerk_ticket'), { timeout: 60000 })

  // Wait for the page to finish rendering before saving state and calling
  // e2e-revalidate. In CI, '/' is slow to render (several sequential DB calls
  // inside generateScheduleHorizon). Calling revalidatePath while the page is
  // still rendering deadlocks in Next.js dev mode.
  await page.waitForLoadState('load', { timeout: 60000 })

  fs.mkdirSync(path.dirname(authFile), { recursive: true })
  await page.context().storageState({ path: authFile })

  // scripts/seed-e2e.ts writes with raw SQL, which fetchData's unstable_cache
  // (lib/db.ts) has no way to know about — without this, pages can keep
  // serving a previous run's cached result for up to 5 minutes. See
  // app/api/e2e-revalidate/route.ts.
  const revalidateResponse = await page.request.post('/api/e2e-revalidate')
  expect(revalidateResponse.ok(), `e2e-revalidate failed: ${revalidateResponse.status()}`).toBe(true)
})
