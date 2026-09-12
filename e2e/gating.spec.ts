import { test, expect } from '@playwright/test'

// #337: route-level leader gate. A signed-in NON-leader who types a leader-only
// URL must be redirected to '/' (which then routes onward), NOT shown the page.
// A leader must still reach every gated route. Guards a pre-existing hole: only
// the write *actions* gated on role before this; the pages themselves rendered
// for any signed-in user.
//
// /library/edit is asserted WITHOUT a variantId on purpose. For a leader that path
// hits the page's own notFound() — but the URL stays /library/edit, proving the
// gate let them through. For a runner the gate fires first and bounces them to '/'
// before notFound() is ever reached. So the pathname after navigation is exactly
// what differs between the two roles, for every route, which is what we assert.
const GATED_ROUTES = ['/plan', '/library/add', '/library/edit', '/run-config']

async function landingPathAfter(page: import('@playwright/test').Page, route: string) {
  await page.goto(route)
  await page.waitForLoadState('load')
  return new URL(page.url()).pathname
}

test.describe('leader retains access to every gated route', () => {
  // storageState defaults to e2e/.auth/user.json (the seeded, run-linked leader)
  // via playwright.config.ts's chromium project.
  for (const route of GATED_ROUTES) {
    test(`leader reaches ${route} (not redirected home)`, async ({ page }) => {
      expect(await landingPathAfter(page, route)).toBe(route)
    })
  }
})

test.describe('signed-in non-leader is redirected off every gated route', () => {
  test.use({ storageState: 'e2e/.auth/runner.json' })
  for (const route of GATED_ROUTES) {
    test(`runner is redirected away from ${route}`, async ({ page }) => {
      expect(await landingPathAfter(page, route)).not.toBe(route)
    })
  }
})
