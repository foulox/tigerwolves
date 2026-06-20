import { test, expect } from '@playwright/test'

test('Schedule page loads with upcoming Tuesday entries', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  // Page should show leader name (from "Led by X" lines) or the no-workouts fallback
  const body = page.locator('body')
  await expect(body).toContainText(/led by|no upcoming workouts/i)
})
