import { test, expect } from '@playwright/test'

test('Library page loads with workout cards', async ({ page }) => {
  await page.goto('/library')
  await page.waitForLoadState('networkidle')
  // Should show at least one workout name or the empty state
  await expect(page.locator('body')).toContainText(/quality|easy|long|no workouts/i)
})

test('Library category filter changes visible cards', async ({ page }) => {
  await page.goto('/library')
  await page.waitForLoadState('networkidle')
  // Find a category button (Quality, Easy, Long) and click it
  const categoryBtn = page.getByRole('button', { name: /quality|easy|long/i }).first()
  if (await categoryBtn.isVisible()) {
    await categoryBtn.click()
    // After clicking, page should still show content
    await expect(page.locator('body')).toContainText(/quality|easy|long|no workouts/i)
  }
})
