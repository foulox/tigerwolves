import { test, expect } from '@playwright/test'

test('Library page loads with all 8 fixture workout names', async ({ page }) => {
  await page.goto('/library')
  await page.waitForLoadState('networkidle')

  const countEl = page.locator('p').filter({ hasText: /workouts · oldest first/ })
  await expect(countEl).toHaveText('8 workouts · oldest first')

  await expect(page.getByText('Easy Recovery Run')).toBeVisible()
  await expect(page.getByText('Long Run — Progressive')).toBeVisible()
  await expect(page.getByText('Yasso 800s')).toBeVisible()
  await expect(page.getByText('Fort Greene Hills')).toBeVisible()
  await expect(page.getByText('Prospect Park Tempo')).toBeVisible()
  await expect(page.getByText('Track Ladder 400-800-1200')).toBeVisible()
  await expect(page.getByText('McCarren Loop Repeats').first()).toBeVisible()
})

test('Library category filter narrows to exactly the 6 Quality-category rows', async ({ page }) => {
  await page.goto('/library')
  await page.waitForLoadState('networkidle')

  const countEl = page.locator('p').filter({ hasText: /workouts · oldest first/ })
  await expect(countEl).toHaveText('8 workouts · oldest first')

  await page.getByRole('button', { name: 'Quality', exact: true }).click()
  await expect(countEl).toHaveText('6 workouts · oldest first')

  // Easy/Long baseline workouts must drop out of the filtered view
  await expect(page.getByText('Easy Recovery Run')).toHaveCount(0)
  await expect(page.getByText('Long Run — Progressive')).toHaveCount(0)
  await expect(page.getByText('Fort Greene Hills')).toBeVisible()
})
