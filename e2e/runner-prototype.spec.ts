import { test, expect } from '@playwright/test'

// All runner routes are public — no auth needed
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Runner prototype — #302', () => {

  // AC1
  test('Roadmap has "Preview: Runner View" link that navigates to /runner', async ({ page }) => {
    await page.goto('/roadmap')
    const link = page.getByRole('link', { name: /Preview.*Runner View/i })
    await expect(link).toBeVisible()
    await link.click()
    await expect(page).toHaveURL('/runner')
  })

  test.describe('My Week — /runner', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/runner')
    })

    // AC2
    test('shows My Week with Mourning Doves as NEXT UP', async ({ page }) => {
      await expect(page.getByText('NEXT UP')).toBeVisible()
      await expect(page.getByText(/Mourning Doves/i).first()).toBeVisible()
    })

    // AC2 — Hellkatz not joined by default, so not in My Week
    test('does not show Hellkatz in My Week before joining', async ({ page }) => {
      // Hellkatz should either be absent or shown as a dashed "not joined" slot — never as a joined run
      const hellkatzJoined = page.locator('[data-testid="run-card-hellkatz"]')
      await expect(hellkatzJoined).not.toBeVisible()
    })

    // AC3
    test('tapping a run card expands to show workout detail', async ({ page }) => {
      // The Mourning Doves card is NEXT UP and should show detail on tap
      await page.getByText(/Mourning Doves/i).first().click()
      // "Hey Doves!" only appears in the expanded prose, not the compact subtitle
      await expect(page.getByText(/Hey Doves/i)).toBeVisible()
    })

    // AC4 — Mourning Doves links to /runner/run/mourning-doves
    test('expanded Mourning Doves card links to its run page', async ({ page }) => {
      await page.getByText(/Mourning Doves/i).first().click()
      const runLink = page.getByRole('link', { name: /See all Mourning Doves|Mourning Doves →/i })
      await expect(runLink).toBeVisible()
      await runLink.click()
      await expect(page).toHaveURL('/runner/run/mourning-doves')
    })

    // AC10 — RunnerNav visible; existing BottomNav hidden
    test('RunnerNav is visible and existing BottomNav is hidden', async ({ page }) => {
      await expect(page.getByRole('link', { name: 'My Week' })).toBeVisible()
      // The regular app nav has a Schedule tab — it should not appear on runner routes
      const scheduleLink = page.getByRole('link', { name: 'Schedule' })
      await expect(scheduleLink).not.toBeVisible()
    })

    // AC12
    test('page loads without horizontal scroll at 390px', async ({ page }) => {
      const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth)
      expect(overflow).toBe(false)
    })
  })

  // AC5
  test('Mourning Doves run page shows upcoming Wednesday workouts', async ({ page }) => {
    await page.goto('/runner/run/mourning-doves')
    await expect(page.getByText(/Mourning Doves/i).first()).toBeVisible()
    await expect(page.getByText('NEXT UP')).toBeVisible()
    await expect(page.getByText(/Socrates Sculpture Park/i)).toBeVisible()
    // "Wednesday, Sep 9" is exact — avoids false matches on Sep 16's "~9mi" description
    await expect(page.getByText('Wednesday, Sep 9').first()).toBeVisible()
  })

  // #330: the /runner/all-runs prototype was retired — its route now redirects to
  // /all-runs (the real, auth-aware surface), and its behavior is covered by
  // e2e/all-runs.spec.ts. The prototype's My Week (/runner) and Mourning Doves run
  // page remain until R4 (#332) retires them.

  // AC10 — RunnerNav appears on /runner/run/mourning-doves too
  test('RunnerNav appears on Mourning Doves run page', async ({ page }) => {
    await page.goto('/runner/run/mourning-doves')
    await expect(page.getByRole('link', { name: 'My Week' })).toBeVisible()
  })
})
