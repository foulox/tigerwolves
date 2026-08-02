import { test, expect } from '@playwright/test'

test('Schedule page shows the three seeded upcoming Tuesdays', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  await expect(page.locator('[data-testid="schedule-card-0"]')).toContainText('Yasso 800s')
  await expect(page.locator('[data-testid="schedule-card-0"]')).toContainText('Led by Dana Kim')

  await expect(page.locator('[data-testid="schedule-card-1"]')).toContainText('Fort Greene Hills')
  await expect(page.locator('[data-testid="schedule-card-1"]')).toContainText('Led by Marcus Ade')

  await expect(page.locator('[data-testid="schedule-card-2"]')).toContainText('Not planned yet')
  await expect(page.locator('[data-testid="schedule-card-2"]')).toContainText('Led by Priya Shah')
})

test('"Plan week →" button appears on all three cards for signed-in leaders', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  const cards = page.locator('[data-testid^="schedule-card-"]')
  await expect(cards).toHaveCount(3)

  for (let i = 0; i < 3; i++) {
    const btn = page.locator(`[data-testid="plan-week-${i}"]`)
    await expect(btn).toBeVisible()
    await expect(btn).toContainText('Plan week')
  }
})

test('"Plan week →" navigates to /plan?week=N', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  await page.locator('[data-testid="plan-week-0"]').click()
  await page.waitForURL(/\/plan\?week=0/)
  expect(page.url()).toContain('/plan?week=0')
})

test('card with planned workout expands to show fixture instructions on tap', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  await page.locator('[data-testid="schedule-card-0"]').click()
  const detail = page.locator('[data-testid="schedule-detail-0"]')
  await expect(detail).toBeVisible()
  await expect(detail).toContainText('10x800m @ 5K effort')
})

test('expanded card collapses on second tap', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  const card = page.locator('[data-testid="schedule-card-0"]')
  const detail = page.locator('[data-testid="schedule-detail-0"]')

  await card.click()
  await expect(detail).toBeVisible()

  await card.click()
  await expect(detail).not.toBeVisible()
})

test('unplanned card has no expand affordance', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  // Card 2 has no workout — clicking it must not reveal a detail panel
  await page.locator('[data-testid="schedule-card-2"]').click()
  await expect(page.locator('[data-testid="schedule-detail-2"]')).toHaveCount(0)
})

test('fixture has no past history — past-card testids never appear, and upcoming testids never collide with them', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  await expect(page.locator('[data-testid^="past-card-"]')).toHaveCount(0)

  const scheduleCards = page.locator('[data-testid^="schedule-card-"]')
  const count = await scheduleCards.count()
  for (let i = 0; i < count; i++) {
    const testId = await scheduleCards.nth(i).getAttribute('data-testid')
    expect(testId).not.toContain('past')
  }
})
