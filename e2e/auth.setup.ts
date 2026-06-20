import { test as setup } from '@playwright/test'
import path from 'path'

const authFile = path.join(__dirname, '.auth/user.json')

setup('authenticate as test leader', async ({ page }) => {
  const email = process.env.PLAYWRIGHT_TEST_EMAIL
  const password = process.env.PLAYWRIGHT_TEST_PASSWORD
  if (!email || !password) throw new Error('PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD must be set in .env.local')

  await page.goto('/sign-in')
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole('button', { name: /sign in|continue/i }).click()
  await page.waitForURL(url => !url.pathname.startsWith('/sign-in'), { timeout: 15000 })
  await page.context().storageState({ path: authFile })
})
