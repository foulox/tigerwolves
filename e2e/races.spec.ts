import { test, expect } from '@playwright/test'

test('Races page shows both fixture races with correct verified/flagged state', async ({ page }) => {
  await page.goto('/races')
  await page.waitForLoadState('networkidle')

  const verifiedCard = page.locator('[data-testid="race-card-Brooklyn Half Marathon"]')
  await expect(verifiedCard.getByText('Verified', { exact: true })).toBeVisible()

  const flaggedCard = page.locator('[data-testid="race-card-Prospect Park 5K Series #3"]')
  await expect(flaggedCard.getByText('Unverified')).toBeVisible()
  await expect(flaggedCard.getByRole('button', { name: 'Issue reported' })).toBeVisible()
})

test('Opening the reported issue on the flagged race shows its flag note', async ({ page }) => {
  await page.goto('/races')
  await page.waitForLoadState('networkidle')

  const flaggedCard = page.locator('[data-testid="race-card-Prospect Park 5K Series #3"]')
  await flaggedCard.getByRole('button', { name: 'Issue reported' }).click()

  await expect(page.getByRole('heading', { name: 'Reported issue' })).toBeVisible()
  await expect(page.getByText("Date TBD — organizer hasn't confirmed")).toBeVisible()
})
