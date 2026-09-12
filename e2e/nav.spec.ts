import { test, expect, type Page } from '@playwright/test'

// #332 Home flip — the unified BottomNav. One nav for everyone: My Week replaces
// the retired Schedule tab, and Plan is leader-only (server-gated on role, not
// merely on being signed in). Scope every assertion to the bottom nav so page
// content can't satisfy or spoil a match.
function bottomNav(page: Page) {
  return page.locator('nav').filter({ has: page.locator('a[href="/all-runs"]') })
}

test.describe('unified nav — signed-in leader', () => {
  test('shows My Week (not Schedule) and the leader-only Plan tab', async ({ page }) => {
    await page.goto('/all-runs')
    await page.waitForLoadState('load')
    const nav = bottomNav(page)

    // My Week replaced the standalone Schedule tab.
    await expect(nav.locator('a[href="/my-week"]')).toContainText('My Week')
    await expect(nav.getByRole('link', { name: 'Schedule' })).toHaveCount(0)
    await expect(nav.locator('a[href="/"]')).toHaveCount(0)

    // Plan is visible for a leader; the rest of the superset is present.
    await expect(nav.locator('a[href="/plan"]')).toBeVisible()
    await expect(nav.locator('a[href="/library"]')).toBeVisible()
    await expect(nav.locator('a[href="/races"]')).toBeVisible()
    await expect(nav.locator('a[href="/roadmap"]')).toBeVisible()
  })
})

test.describe('unified nav — non-leader (logged out)', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('shows My Week but hides the leader-only Plan tab', async ({ page }) => {
    await page.goto('/all-runs')
    await page.waitForLoadState('load')
    const nav = bottomNav(page)

    await expect(nav.locator('a[href="/my-week"]')).toBeVisible()
    await expect(nav.locator('a[href="/plan"]')).toHaveCount(0)
  })
})
