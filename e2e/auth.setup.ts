import { test as setup, expect } from '@playwright/test'
import { clerk } from '@clerk/testing/playwright'
import fs from 'fs'
import path from 'path'

const authFile = path.join(__dirname, '.auth/user.json')

setup('authenticate as test leader', async ({ page }) => {
  const email = process.env.PLAYWRIGHT_TEST_EMAIL
  const password = process.env.PLAYWRIGHT_TEST_PASSWORD
  if (!email || !password) throw new Error('PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD must be set in .env.test')

  // Signs in via Clerk's JS SDK directly (Clerk.client.signIn.create + setActive),
  // bypassing the hosted sign-in UI entirely — a UI-driven password sign-in from
  // a fresh browser gets redirected by Device Trust to an email-verification step
  // (/sign-in/client-trust) this script has no way to complete. clerk.signIn()
  // uses a Clerk testing token internally to skip that. See #273.
  await page.goto('/')
  await clerk.signIn({
    page,
    signInParams: { strategy: 'password', identifier: email, password },
  })

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
