import { test, expect, type Page } from '@playwright/test'

// #510 (NBR v2 Story 1) — CHARACTERIZATION spec for the Header's interactive
// contract. Written BEFORE the reskin (Task 4) so a hand-edit that silently drops
// a behavior turns this red instead of relying on a Preview eyeball. It asserts
// BEHAVIOR ONLY — roles, aria, hrefs, navigation — never visual classes, colors,
// or fonts, which the reskin is MEANT to change. It must stay green through the
// Header reskin (Task 5).
//
// storageState defaults to e2e/.auth/user.json (the seeded test leader) via
// playwright.config.ts, so the UserButton leader menu is present.
//
// Scope: the Header interaction gap only. BottomNav tab hrefs/labels/role-gating
// are covered by nav.spec.ts; Header identity (logo alt) by all-runs.spec.ts.

// Clerk's UserButton.Link items are NOT exposed as role="menuitem" (the popover
// isn't a strict ARIA menu), so match by accessible name across the roles Clerk
// may render them as — link/button/menuitem. (Pattern mirrored from run-config.spec.ts.)
function menuItem(page: Page, name: RegExp) {
  return page
    .getByRole('menuitem', { name })
    .or(page.getByRole('link', { name }))
    .or(page.getByRole('button', { name }))
}

async function openUserMenu(page: Page) {
  await page.locator('.cl-userButtonTrigger').click()
}

test.describe('Header interactive contract (#510 characterization)', () => {
  test('back-chevron has aria-label "Go back" and fires router.back()', async ({ page }) => {
    // /all-runs → /run-config builds real history; /run-config renders the Header
    // with showBack for the linked leader. router.back() must return to /all-runs.
    await page.goto('/all-runs')
    await page.waitForLoadState('load')
    await page.goto('/run-config')
    await page.waitForLoadState('load')

    const back = page.getByRole('button', { name: 'Go back' })
    await expect(back).toBeVisible()

    await back.click()
    await page.waitForURL('**/all-runs')
    expect(new URL(page.url()).pathname).toBe('/all-runs')
  })

  test('leader UserButton menu: Run Settings navigates to /run-config', async ({ page }) => {
    await page.goto('/all-runs')
    await page.waitForLoadState('load')

    await openUserMenu(page)
    const runSettings = menuItem(page, /run settings/i)
    await expect(runSettings).toBeVisible()
    await runSettings.click()

    await page.waitForURL('**/run-config')
    expect(new URL(page.url()).pathname).toBe('/run-config')
  })

  test('leader UserButton menu: Edit Workouts navigates to /admin', async ({ page }) => {
    await page.goto('/all-runs')
    await page.waitForLoadState('load')

    await openUserMenu(page)
    const editWorkouts = menuItem(page, /edit workouts/i)
    await expect(editWorkouts).toBeVisible()
    await editWorkouts.click()

    await page.waitForURL('**/admin')
    expect(new URL(page.url()).pathname).toBe('/admin')
  })

  test('FeedbackButton renders in the Header', async ({ page }) => {
    await page.goto('/all-runs')
    await page.waitForLoadState('load')
    await expect(page.getByRole('button', { name: 'Feedback' })).toBeVisible()
  })
})
