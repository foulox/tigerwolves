import { test, expect } from '@playwright/test'

// Food Runs exist only on Fridays — filtering by this category guarantees
// at least one of Today/Tomorrow is empty regardless of which day tests run.
const ALWAYS_EMPTY_LEAD_DAY_CATEGORY = '[data-testid="category-chip-food-runs"]'

test('BottomNav has All Runs tab pointing to /all-runs (AC1)', async ({ page }) => {
  // #332: '/' redirects now; go straight to a stable page that renders BottomNav.
  await page.goto('/all-runs')
  await page.waitForLoadState('load')
  const tab = page.locator('a[href="/all-runs"]')
  await expect(tab).toBeVisible()
  await expect(tab).toContainText('All Runs')
})

test('loads without auth cookies — no redirect to sign-in (AC2)', async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await context.newPage()
  await page.goto('/all-runs')
  await page.waitForLoadState('load')
  expect(page.url()).toContain('/all-runs')
  expect(page.url()).not.toContain('/sign-in')
  await context.close()
})

test('run rows are visible with name, time, and category pill (AC3)', async ({ page }) => {
  await page.goto('/all-runs')
  await page.waitForLoadState('load')
  const rows = page.locator('[data-testid="run-row"]')
  expect(await rows.count()).toBeGreaterThan(0)
  await expect(page.locator('[data-testid="run-name"]').first()).toBeVisible()
  await expect(page.locator('[data-testid="run-category-pill"]').first()).toBeVisible()
})

test('Morning filter hides PM runs; Evening filter hides AM runs; Weekend shows only Sat/Sun (AC4)', async ({ page }) => {
  await page.goto('/all-runs')
  await page.waitForLoadState('load')

  // Morning: all visible run times should end in "am"
  await page.locator('[data-testid="time-filter-am"]').click()
  const morningRows = page.locator('[data-testid="run-row"]')
  const morningCount = await morningRows.count()
  expect(morningCount).toBeGreaterThan(0)
  for (let i = 0; i < morningCount; i++) {
    const timeEl = morningRows.nth(i).locator('span').first()
    await expect(timeEl).not.toContainText('pm')
  }

  // Evening: all visible run times should end in "pm"
  await page.locator('[data-testid="time-filter-pm"]').click()
  const eveningRows = page.locator('[data-testid="run-row"]')
  const eveningCount = await eveningRows.count()
  expect(eveningCount).toBeGreaterThan(0)
  for (let i = 0; i < eveningCount; i++) {
    const timeEl = eveningRows.nth(i).locator('span').first()
    await expect(timeEl).not.toContainText('am')
  }

  // Weekend: only Sat and Sun day blocks should be present
  await page.locator('[data-testid="time-filter-wknd"]').click()
  await expect(page.locator('[data-testid="day-block-sat"]')).toBeVisible()
  await expect(page.locator('[data-testid="day-block-sun"]')).toBeVisible()
  const allBlocks = page.locator('[data-testid^="day-block-"]')
  await expect(allBlocks).toHaveCount(2)
})

test('Workouts category chip shows only Workouts-labelled runs (AC5)', async ({ page }) => {
  await page.goto('/all-runs')
  await page.waitForLoadState('load')
  await page.locator('[data-testid="category-chip-workouts"]').click()
  const pills = page.locator('[data-testid="run-category-pill"]')
  const count = await pills.count()
  expect(count).toBeGreaterThan(0)
  for (let i = 0; i < count; i++) {
    await expect(pills.nth(i)).toHaveText('Workouts')
  }
})

test('food-run filter empties at least one lead day; later non-matching days are absent (AC6)', async ({ page }) => {
  await page.goto('/all-runs')
  await page.waitForLoadState('load')

  // Food Runs exist only on Friday — at least one of Today/Tomorrow is always a non-Friday
  await page.locator(ALWAYS_EMPTY_LEAD_DAY_CATEGORY).click()

  // At least one lead day must show the empty-state panel
  const emptyStates = page.locator('[data-testid="empty-day-state"]')
  expect(await emptyStates.count()).toBeGreaterThan(0)

  // No non-Fri day block should contain run rows (Food Runs are Fridays only)
  const nonFriBlocks = ['mon', 'tue', 'wed', 'thu', 'sat', 'sun']
  for (const day of nonFriBlocks) {
    const block = page.locator(`[data-testid="day-block-${day}"]`)
    // Non-lead days with no runs should be absent from the DOM entirely
    const count = await block.count()
    if (count > 0) {
      await expect(block.locator('[data-testid="run-row"]')).toHaveCount(0)
    }
  }
})

test('"Lead a run that isn\'t here?" CTA is visible; Add your run opens feedback drawer pre-set to run-leader (AC7)', async ({ page }) => {
  await page.goto('/all-runs')
  await page.waitForLoadState('load')
  await expect(page.locator('[data-testid="leader-cta"]')).toBeVisible()
  await page.locator('[data-testid="add-your-run-btn"]').click()
  await expect(page.getByText('Send Feedback')).toBeVisible()
  await expect(page.getByText('Run leader feedback')).toBeVisible()
})

test('page renders without horizontal overflow at 390px (AC9)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/all-runs')
  await page.waitForLoadState('load')
  const overflow = await page.evaluate(() => document.body.scrollWidth > document.body.clientWidth)
  expect(overflow).toBe(false)
})

test('header is standard Header.tsx — no Join NBR, no NORTH BROOKLYN RUNNERS eyebrow (AC10)', async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await context.newPage()
  await page.goto('/all-runs')
  await page.waitForLoadState('load')
  await expect(page.getByText('Join NBR', { exact: false })).toHaveCount(0)
  await expect(page.getByText('NORTH BROOKLYN RUNNERS', { exact: false })).toHaveCount(0)
  // Standard sign-in link (not a "Log in" text link) should be present for logged-out users
  await expect(page.locator('a[href*="sign-in"]')).toBeVisible()
  await context.close()
})

// ── #330: auth-aware personalization (join/leave + tiers) ──────────────────────

test('logged-out: no follow toggles, no Following tier, no "not on the app" markers', async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await context.newPage()
  await page.goto('/all-runs')
  await page.waitForLoadState('load')
  await expect(page.locator('[data-testid="following-tier"]')).toHaveCount(0)
  await expect(page.locator('[data-testid^="follow-toggle-"]')).toHaveCount(0)
  await expect(page.locator('[data-testid^="not-on-app-"]')).toHaveCount(0)
  await context.close()
})

test('signed-in: a directory-only NBR run is muted "Not on the app yet"', async ({ page }) => {
  // Default context is the signed-in TigerWolves leader. tue-bushwick is a real
  // NBR run with no platform mapping → not joinable.
  await page.goto('/all-runs')
  await page.waitForLoadState('load')
  await expect(page.locator('[data-testid="not-on-app-tue-bushwick"]')).toBeVisible()
  await expect(page.locator('[data-testid="follow-toggle-tue-bushwick"]')).toHaveCount(0)
})

test('signed-in: join MMER → appears in Following tier; leave → removed (AC: join/leave)', async ({ page }) => {
  await page.goto('/all-runs')
  await page.waitForLoadState('load')

  const rowToggle = page.locator('[data-testid="follow-toggle-mmer"]')
  await expect(rowToggle).toBeVisible()
  await expect(rowToggle).toContainText('Join')

  // Join
  await rowToggle.click()
  await expect(page.locator('[data-testid="following-run-mmer"]')).toBeVisible()
  await expect(rowToggle).toContainText('Joined')

  // Leave (from the row toggle) — Following tier entry disappears
  await rowToggle.click()
  await expect(page.locator('[data-testid="following-run-mmer"]')).toHaveCount(0)
  await expect(rowToggle).toContainText('Join')
})
