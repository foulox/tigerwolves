import { test, expect } from '@playwright/test'

// #426: the REAL Mourning Doves run (run_id 'wednesday-mourning-doves', kind
// 'Long') seeded onto real curated route data — no separate 'doves' shadow. This
// exercises the Long/route run END-TO-END in the browser (not only the pure
// mourningDoves.test.ts unit tests): the per-run page must render each schedule
// card as a route (distance + "View route ↗"), the read shape #382 depends on.
//
// The default project is signed in as the TigerWolves test-leader, who does NOT
// own this run — so it renders read-only, which is exactly the reader path a route
// run needs to prove out.

test.describe('Mourning Doves route run (/runs/wednesday-mourning-doves)', () => {
  test('renders the run identity header (name + Wednesday)', async ({ page }) => {
    await page.goto('/runs/wednesday-mourning-doves')
    await page.waitForLoadState('load')

    await expect(page.locator('header h1')).toContainText('Wednesday Mourning Doves')
    await expect(page.locator('header p')).toContainText('Wednesday')
  })

  test('the first schedule card renders as a route — real name, distance, and route link', async ({ page }) => {
    await page.goto('/runs/wednesday-mourning-doves')
    await page.waitForLoadState('load')

    const card = page.locator('[data-testid="schedule-card-0"]')
    await expect(card).toBeVisible()
    // Resolved to the real curated route (not "Not planned yet").
    await expect(card).toContainText('All The Water Fountains')
    // Long/route shape: a distance and a "View route ↗" link — no interval set.
    await expect(page.locator('[data-testid="schedule-distance-0"]')).toContainText('9.4 miles')
    await expect(page.locator('[data-testid="schedule-route-0"]')).toContainText('View route')
  })
})
