import { test, expect } from '@playwright/test'

test('Admin page loads with Regroup Workouts heading', async ({ page }) => {
  await page.goto('/admin')
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('heading', { name: /regroup workouts/i })).toBeVisible()
})

test('Configure button is visible in viewport without scrolling', async ({ page }) => {
  await page.goto('/admin')
  await page.waitForLoadState('networkidle')

  // The fixed footer means Configure is always in the viewport — no scrolling needed
  const configureBtn = page.getByRole('button', { name: /configure/i })
  await expect(configureBtn).toBeVisible()
  await expect(configureBtn).toBeInViewport()
})
