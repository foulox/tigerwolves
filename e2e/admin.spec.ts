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

test('Regroup flow merges the two reserved fixture workouts into a new family', async ({ page }) => {
  await page.goto('/admin')
  await page.waitForLoadState('networkidle')

  await page.locator('[data-testid="regroup-option-McCarren Loop Repeats||Short loop, 6x800m"]').click()
  await page.locator('[data-testid="regroup-option-McCarren Loop Repeats||Long loop, 4x1200m"]').click()

  const configureBtn = page.getByRole('button', { name: /configure/i })
  await expect(configureBtn).toBeEnabled()
  await configureBtn.click()

  await page.locator('[data-testid="regroup-family-name"]').fill('Greenpoint Loop Ladder')
  await page.locator('[data-testid="regroup-variation-input-0"]').fill('Short loop, 6x800m')
  await page.locator('[data-testid="regroup-variation-input-1"]').fill('Long loop, 4x1200m')

  await page.locator('[data-testid="regroup-save"]').click()

  // regroupFamily redirects to /library on success — arriving there is itself
  // evidence the server action didn't throw.
  await page.waitForURL(/\/library/)
  await page.waitForLoadState('networkidle')

  await expect(page.getByText('Greenpoint Loop Ladder').first()).toBeVisible()
  await expect(page.getByText('McCarren Loop Repeats')).toHaveCount(0)
})
