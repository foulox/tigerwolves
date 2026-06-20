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

  const countEl = page.locator('p').filter({ hasText: /workouts · oldest first/ })
  const beforeText = await countEl.textContent()

  const categoryBtn = page.getByRole('button', { name: 'Quality', exact: true })
  await expect(categoryBtn).toBeVisible()
  await categoryBtn.click()

  // Count should change — Quality is a subset of all workouts
  await expect(countEl).not.toHaveText(beforeText ?? '')
})
