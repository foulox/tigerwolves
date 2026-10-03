import { test, expect, type Page } from '@playwright/test'

// #465 Story B — offline read-only. The SW only exists in a production build
// (CI `npm run build && npm run start`); under local `next dev` it is disabled,
// so skip rather than false-fail.
async function serviceWorkerActive(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false
    const reg = await navigator.serviceWorker.getRegistration()
    return !!reg && !!navigator.serviceWorker.controller
  })
}

test.describe('offline read-only (#465)', () => {
  test('public routes survive offline; uncached + auth routes fall back', async ({ page, context }) => {
    // Prime the cache online.
    for (const route of ['/all-runs', '/library', '/races']) {
      await page.goto(route)
      await page.waitForLoadState('networkidle')
    }

    if (!(await serviceWorkerActive(page))) {
      test.skip(true, 'SW disabled (local next dev build) — verified in CI/Preview prod build')
    }

    await context.setOffline(true)

    // Cached public routes still render offline — assert the real cached page
    // was served, NOT the offline fallback. getByRole('main') alone is not
    // discriminating (app/layout renders <main> on the offline page too).
    await page.goto('/all-runs')
    await expect(page.getByRole('main')).toBeVisible()
    await expect(page.getByRole('heading', { name: /all runs/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /offline/i })).toHaveCount(0)
    await page.goto('/library')
    await expect(page.getByRole('main')).toBeVisible()
    await expect(page.getByRole('heading', { name: /library/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /offline/i })).toHaveCount(0)

    // Second offline load of a cached route — SWR revalidation fails silently,
    // cached copy still served, no error overlay.
    await page.goto('/races')
    await expect(page.getByRole('main')).toBeVisible()
    await expect(page.getByRole('heading', { name: /races/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /offline/i })).toHaveCount(0)

    // A never-visited route offline → branded fallback, not a blank/stale page.
    await page.goto('/runs/this-slug-was-never-opened')
    await expect(page.getByRole('heading', { name: /offline/i })).toBeVisible()

    // An auth/write route offline → fallback, NEVER a cached authed view.
    await page.goto('/schedule')
    await expect(page.getByRole('heading', { name: /offline/i })).toBeVisible()

    await context.setOffline(false)
  })
})
