import { test, expect, type Page } from '@playwright/test'

test('Schedule page loads with upcoming Tuesday entries', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  // Page should show leader name (from "Led by X" lines) or the no-workouts fallback
  const body = page.locator('body')
  await expect(body).toContainText(/led by|no upcoming workouts/i)
})

test('"Plan week →" button appears on all cards for signed-in leaders', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  const cards = page.locator('[data-testid^="schedule-card-"]')
  const count = await cards.count()
  if (count === 0) return // no upcoming entries, nothing to verify

  // Plan button is leader-only; this suite runs as a signed-in leader
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

/** Returns the index of the first card with a planned workout, or -1. Does not change expand state. */
async function findFirstPlannedCardIdx(page: Page): Promise<number> {
  const cards = page.locator('[data-testid^="schedule-card-"]')
  const count = await cards.count()
  for (let i = 0; i < count; i++) {
    const text = await page.locator(`[data-testid="schedule-card-${i}"]`).textContent()
    if (!text?.includes('Not planned yet')) return i
  }
  return -1
}

test('card with planned workout expands to show detail on tap', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  const idx = await findFirstPlannedCardIdx(page)
  if (idx === -1) {
    console.warn('No cards with planned workouts found — expand test ran vacuously')
    return
  }

  await page.locator(`[data-testid="schedule-card-${idx}"]`).click()
  await expect(page.locator(`[data-testid="schedule-detail-${idx}"]`)).toBeVisible()
})

test('expanded card collapses on second tap', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  const idx = await findFirstPlannedCardIdx(page)
  if (idx === -1) {
    console.warn('No cards with planned workouts found — collapse test ran vacuously')
    return
  }

  const card = page.locator(`[data-testid="schedule-card-${idx}"]`)
  const detail = page.locator(`[data-testid="schedule-detail-${idx}"]`)

  await card.click()
  await expect(detail).toBeVisible()

  await card.click()
  await expect(detail).not.toBeVisible()
})
