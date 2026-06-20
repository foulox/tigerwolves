import { test as setup } from '@playwright/test'
import path from 'path'

const authFile = path.join(__dirname, '.auth/user.json')

setup('authenticate as test leader', async ({ page }) => {
  const email = process.env.PLAYWRIGHT_TEST_EMAIL
  const password = process.env.PLAYWRIGHT_TEST_PASSWORD
  if (!email || !password) throw new Error('PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD must be set in .env.local')

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
  await page.context().storageState({ path: authFile })
})
