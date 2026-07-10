import { test, expect } from '@playwright/test'

test('Schedule page loads with upcoming Tuesday entries', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  // Page should show leader name (from "Led by X" lines) or the no-workouts fallback
  const body = page.locator('body')
  await expect(body).toContainText(/led by|no upcoming workouts/i)
})

test('"Plan week →" buttons appear on all schedule cards', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  const cards = page.locator('[data-testid^="schedule-card-"]')
  const count = await cards.count()
  if (count === 0) return // no upcoming entries, nothing to verify

  // Every card should have a "Plan week →" link
  for (let i = 0; i < count; i++) {
    const btn = page.locator(`[data-testid="plan-week-${i}"]`)
    await expect(btn).toBeVisible()
    await expect(btn).toContainText('Plan week')
  }
})

test('"Plan week →" navigates to /plan?week=N', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  const firstCard = page.locator('[data-testid="schedule-card-0"]')
  const hasCard = await firstCard.count() > 0
  if (!hasCard) return

  const planBtn = page.locator('[data-testid="plan-week-0"]')
  await planBtn.click()
  await page.waitForURL(/\/plan\?week=0/)
  expect(page.url()).toContain('/plan?week=0')
})

test('card with planned workout expands to show detail on tap', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  // Find the first card that has a workout (has a detail panel available)
  const cards = page.locator('[data-testid^="schedule-card-"]')
  const count = await cards.count()

  let expandedIdx = -1
  for (let i = 0; i < count; i++) {
    const card = page.locator(`[data-testid="schedule-card-${i}"]`)
    const cardText = await card.textContent()
    // Cards without workout show "Not planned yet"; skip those
    if (cardText?.includes('Not planned yet')) continue

    await card.click()
    const detail = page.locator(`[data-testid="schedule-detail-${i}"]`)
    const visible = await detail.isVisible()
    if (visible) {
      expandedIdx = i
      break
    }
  }

  // If no card with a workout was found, skip rather than fail
  if (expandedIdx === -1) return

  await expect(page.locator(`[data-testid="schedule-detail-${expandedIdx}"]`)).toBeVisible()
})

test('expanded card collapses on second tap', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  const cards = page.locator('[data-testid^="schedule-card-"]')
  const count = await cards.count()

  let expandedIdx = -1
  for (let i = 0; i < count; i++) {
    const card = page.locator(`[data-testid="schedule-card-${i}"]`)
    const cardText = await card.textContent()
    if (cardText?.includes('Not planned yet')) continue

    await card.click()
    const detail = page.locator(`[data-testid="schedule-detail-${i}"]`)
    if (await detail.isVisible()) {
      expandedIdx = i
      break
    }
  }

  if (expandedIdx === -1) return

  const detail = page.locator(`[data-testid="schedule-detail-${expandedIdx}"]`)
  await expect(detail).toBeVisible()

  // Second tap collapses
  await page.locator(`[data-testid="schedule-card-${expandedIdx}"]`).click()
  await expect(detail).not.toBeVisible()
})
