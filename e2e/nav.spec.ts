import { test, expect, type Page } from '@playwright/test'

// #332 Home flip — the unified BottomNav. One nav for everyone: My Plan replaces
// the retired Schedule tab, and Schedule is leader-only (server-gated on role, not
// merely on being signed in). Scope every assertion to the bottom nav so page
// content can't satisfy or spoil a match.
function bottomNav(page: Page) {
  return page.locator('nav').filter({ has: page.locator('a[href="/all-runs"]') })
}

test.describe('unified nav — signed-in leader', () => {
  test('shows My Plan and the leader-only Schedule tab', async ({ page }) => {
    await page.goto('/all-runs')
    await page.waitForLoadState('load')
    const nav = bottomNav(page)

    // My Plan is home; My Week is retired.
    await expect(nav.locator('a[href="/my-plan"]')).toContainText('My Plan')
    await expect(nav.locator('a[href="/my-week"]')).toHaveCount(0)
    await expect(nav.locator('a[href="/"]')).toHaveCount(0)

    // Schedule is visible for a leader; the rest of the superset is present.

    // #342: Leader menu button is gone; leader links moved to UserButton
    await expect(page.getByRole('button', { name: 'Leader menu' })).toHaveCount(0)
    await expect(nav.locator('a[href="/schedule"]')).toBeVisible()
    await expect(nav.locator('a[href="/library"]')).toBeVisible()
    await expect(nav.locator('a[href="/races"]')).toBeVisible()
    await expect(nav.locator('a[href="/roadmap"]')).toHaveCount(0)
  })
})

test.describe('unified nav — non-leader (logged out)', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('shows My Plan but hides the leader-only Schedule tab', async ({ page }) => {
    await page.goto('/all-runs')
    await page.waitForLoadState('load')
    const nav = bottomNav(page)

    await expect(nav.locator('a[href="/my-plan"]')).toBeVisible()
    await expect(nav.locator('a[href="/schedule"]')).toHaveCount(0)
  })
})
