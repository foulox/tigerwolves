import { test as setup, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const authFile = path.join(__dirname, '.auth/user.json')

setup('authenticate as test leader', async ({ page }) => {
  const email = process.env.PLAYWRIGHT_TEST_EMAIL
  const password = process.env.PLAYWRIGHT_TEST_PASSWORD
  if (!email || !password) throw new Error('PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD must be set in .env.test')

  await page.goto('/sign-in')

  // Step 1: email
  await page.getByLabel(/email address/i).or(page.getByPlaceholder(/email/i)).fill(email)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()

  // Step 2: password (Clerk shows it after email step)
  const passwordInput = page.getByPlaceholder('Enter your password')
  await passwordInput.waitFor({ timeout: 10000 })
  await passwordInput.fill(password)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()

  await page.waitForURL(url => !url.pathname.startsWith('/sign-in'), { timeout: 15000 })
  fs.mkdirSync(path.dirname(authFile), { recursive: true })
  await page.context().storageState({ path: authFile })

  // scripts/seed-e2e.ts writes with raw SQL, which fetchData's unstable_cache
  // (lib/db.ts) has no way to know about — without this, pages can keep
  // serving a previous run's cached result for up to 5 minutes. See
  // app/api/e2e-revalidate/route.ts.
  const revalidateResponse = await page.request.post('/api/e2e-revalidate')
  expect(revalidateResponse.ok(), `e2e-revalidate failed: ${revalidateResponse.status()}`).toBe(true)
})
