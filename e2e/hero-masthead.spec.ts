import { test, expect, type Page } from '@playwright/test'

// #513 (NBR v2 Story 3) — CHARACTERIZATION spec for the hero-screen control
// contract. Written BEFORE the masthead replaces the Header on /my-plan and
// /runs/[id], so a hand-edit that drops a control turns this red instead of
// relying on a Preview eyeball. BEHAVIOR ONLY — roles, aria, href, navigation —
// never visual classes. Must stay green through the masthead mount (Tasks 5, 7).
//
// Default storageState is the seeded test leader (playwright.config.ts), so the
// UserButton leader menu is present. /all-runs is already covered by header.spec.ts.

function menuItem(page: Page, name: RegExp) {
  return page
    .getByRole('menuitem', { name })
    .or(page.getByRole('link', { name }))
    .or(page.getByRole('button', { name }))
}
async function openUserMenu(page: Page) {
  await page.locator('.cl-userButtonTrigger').click()
}

for (const path of ['/my-plan', '/runs/tuesday-morning-tigerwolves']) {
  test.describe(`hero controls present on ${path} (#513 characterization)`, () => {
    test('FeedbackButton renders', async ({ page }) => {
      await page.goto(path)
      await page.waitForLoadState('load')
      await expect(page.getByRole('button', { name: 'Feedback' })).toBeVisible()
    })

    test('leader UserButton menu: Run Settings → /run-config', async ({ page }) => {
      await page.goto(path)
      await page.waitForLoadState('load')
      await openUserMenu(page)
      const runSettings = menuItem(page, /run settings/i)
      await expect(runSettings).toBeVisible()
      await runSettings.click()
      await page.waitForURL('**/run-config')
      expect(new URL(page.url()).pathname).toBe('/run-config')
    })

    test('leader UserButton menu: Edit Workouts → /admin', async ({ page }) => {
      await page.goto(path)
      await page.waitForLoadState('load')
      await openUserMenu(page)
      const editWorkouts = menuItem(page, /edit workouts/i)
      await expect(editWorkouts).toBeVisible()
      await editWorkouts.click()
      await page.waitForURL('**/admin')
      expect(new URL(page.url()).pathname).toBe('/admin')
    })
  })
}
