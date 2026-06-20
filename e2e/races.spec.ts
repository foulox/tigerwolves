import { test, expect } from '@playwright/test'

test('Races page loads with race entries', async ({ page }) => {
  await page.goto('/races')
  await page.waitForLoadState('networkidle')
  // Should show race names, distances, or the empty state
  await expect(page.locator('body')).toContainText(/marathon|5k|10k|half|mile|no (upcoming )?races/i)
})
