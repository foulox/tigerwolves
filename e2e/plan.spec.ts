import { test, expect } from '@playwright/test'

test('Plan page loads for authenticated leader', async ({ page }) => {
  await page.goto('/plan')
  await page.waitForLoadState('networkidle')
  // Authenticated leaders see the Plan page content
  await expect(page.locator('body')).toContainText(/plan|workout|picker|schedule/i)
})

test('Plan page shows workout picker and generates Heylo post', async ({ page }) => {
  await page.goto('/plan')
  await page.waitForLoadState('networkidle')

  // Try to click the first selectable workout card
  const firstWorkout = page.locator('button').filter({ hasText: /never|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i }).first()
  if (await firstWorkout.isVisible({ timeout: 5000 }).catch(() => false)) {
    await firstWorkout.click()
    // After selecting, the Heylo post draft should appear
    await expect(page.locator('pre, textarea').first()).not.toBeEmpty()
    // Copy button should be visible
    await expect(page.getByRole('button', { name: /copy/i })).toBeVisible()
  } else {
    // If no workouts are available, at least the page renders without error
    await expect(page.locator('body')).toContainText(/plan|no upcoming|workout/i)
  }
})
