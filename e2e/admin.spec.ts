import { test, expect } from '@playwright/test'

test('Edit Workouts page loads with Edit Workouts heading', async ({ page }) => {
  test.setTimeout(90000)
  await page.goto('/admin')
  await page.waitForLoadState('load')
  await expect(page.getByRole('heading', { name: /regroup workouts/i })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: /edit workouts/i })).toBeVisible()
})

test('Configure button is visible in viewport without scrolling', async ({ page }) => {
  test.setTimeout(90000)
  await page.goto('/admin')
  await page.waitForLoadState('load')

  // The fixed footer means Configure is always in the viewport — no scrolling needed
  const configureBtn = page.getByRole('button', { name: /configure/i })
  await expect(configureBtn).toBeVisible()
  await expect(configureBtn).toBeInViewport()
})

test('Regroup flow merges the two reserved fixture workouts into a new family', async ({ page }) => {
  test.setTimeout(90000)
  await page.goto('/admin')
  await page.waitForLoadState('load')

  await page.locator('[data-testid="regroup-option-Domino Park Loop||8 x 800m"]').click()
  await page.locator('[data-testid="regroup-option-Domino Park Loop||10 x 800m"]').click()

  const configureBtn = page.getByRole('button', { name: /configure/i })
  await expect(configureBtn).toBeEnabled()
  await configureBtn.click()

  await page.locator('[data-testid="regroup-family-name"]').fill('Greenpoint Loop Ladder')
  await page.locator('[data-testid="regroup-variation-input-0"]').fill('Short loop, 8x800m')
  await page.locator('[data-testid="regroup-variation-input-1"]').fill('Long loop, 10x800m')

  await page.locator('[data-testid="regroup-save"]').click()

  // regroupFamily redirects to /library on success — arriving there is itself
  // evidence the server action didn't throw.
  await page.waitForURL(/\/library/)
  await page.waitForLoadState('load')

  await expect(page.getByText('Greenpoint Loop Ladder').first()).toBeVisible()
  await expect(page.getByText('Domino Park Loop')).toHaveCount(0)
})
