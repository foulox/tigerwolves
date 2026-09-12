import { test, expect } from '@playwright/test'

// Per-run page (#329). The run-scoped Schedule page at /runs/[id]:
// - anyone can read it; only the owning leader sees edit affordances
// - an unknown run id shows a "Run not found" state (no crash)
//
// The default project runs signed in as the TigerWolves test-leader (see
// playwright.config.ts storageState + e2e/auth.setup.ts, which links that Clerk
// account to the tigerwolves roster). So the default context IS the owning
// leader; the read-only cases use a fresh anonymous context.

test.describe('per-run page (/runs/[id]) — owning leader', () => {
  test('renders run identity header (emoji + name, day) and schedule cards', async ({ page }) => {
    await page.goto('/runs/tigerwolves')
    await page.waitForLoadState('load')

    await expect(page.locator('header h1')).toContainText('TigerWolves')
    await expect(page.locator('header p')).toContainText('Tuesday')

    const cards = page.locator('[data-testid^="schedule-card-"]')
    await expect(cards.first()).toBeVisible()
    expect(await cards.count()).toBeGreaterThan(0)
  })

  test('sees "Plan week →" on upcoming cards and it navigates to /plan?week=N', async ({ page }) => {
    await page.goto('/runs/tigerwolves')
    await page.waitForLoadState('load')

    const planBtn = page.locator('[data-testid="plan-week-0"]')
    await expect(planBtn).toBeVisible()
    await planBtn.click()
    await page.waitForURL(/\/plan\?week=0/)
    expect(page.url()).toContain('/plan?week=0')
  })

  test('expanded card shows fixture instructions (parity with Schedule page)', async ({ page }) => {
    await page.goto('/runs/tigerwolves')
    await page.waitForLoadState('load')

    await page.locator('[data-testid="schedule-card-0"]').click()
    const detail = page.locator('[data-testid="schedule-detail-0"]')
    await expect(detail).toBeVisible()
    await expect(detail).toContainText('10x800m @ 5K effort')
  })

  test('unknown run id shows "Run not found"', async ({ page }) => {
    await page.goto('/runs/nonexistent-12345')
    await expect(page.locator('text=Run not found')).toBeVisible()
    await expect(page.locator('[data-testid^="schedule-card-"]')).toHaveCount(0)
  })
})

test.describe('per-run page (/runs/[id]) — anonymous read-only', () => {
  // Fresh context with no stored auth — a logged-out visitor.
  test.use({ storageState: { cookies: [], origins: [] } })

  test('shows the schedule but no "Plan week →" affordances', async ({ page }) => {
    await page.goto('/runs/tigerwolves')
    await page.waitForLoadState('load')

    await expect(page.locator('header h1')).toContainText('TigerWolves')

    const cards = page.locator('[data-testid^="schedule-card-"]')
    await expect(cards.first()).toBeVisible()
    expect(await cards.count()).toBeGreaterThan(0)

    await expect(page.locator('[data-testid^="plan-week-"]')).toHaveCount(0)
  })
})
