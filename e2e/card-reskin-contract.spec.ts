import { test, expect, type Page } from '@playwright/test'

// Card interactive contract — locked before the NBR Story-2 reskin (#512) and kept
// green through it. Presentation changes (tokens, fonts, chrome); every behavior
// below must survive unchanged.
//
// Auth: default storageState is the TigerWolves test-leader (playwright.config.ts).
// setFollow mirrors the helper in my-plan.spec.ts — defined inline because it
// is not exported from a shared helpers module.

async function setFollow(page: Page, runId: string, shouldFollow: boolean) {
  await page.goto('/all-runs')
  await page.waitForLoadState('load')
  const toggle = page.locator(`[data-testid="follow-toggle-${runId}"]`)
  await expect(toggle).toBeVisible()
  const isFollowing = ((await toggle.textContent()) ?? '').includes('Joined')
  if (isFollowing !== shouldFollow) {
    await toggle.click()
    await expect(toggle).toContainText(shouldFollow ? 'Joined' : '+ Join')
  }
}

test.describe('workout card interactive contract', () => {
  // ── My Plan card (MyPlanCard + WorkoutCardBody) ────────────────────────────

  test('My Plan: collapsed by default; Show details toggles the panel; run link + type label present', async ({ page }) => {
    await setFollow(page, 'tuesday-morning-tigerwolves', true)
    await page.goto('/my-plan')
    await page.waitForLoadState('load')

    const card = page.locator('[data-testid^="my-plan-card-tuesday-morning-tigerwolves-"]').first()

    // Card is collapsed on load — expanded "Reason" text is hidden.
    await expect(card.getByText('race-specific coordination')).toHaveCount(0)

    // Run-link and type pill are present in the collapsed state.
    await expect(card.getByTestId('my-plan-run-link-tuesday-morning-tigerwolves')).toBeVisible()
    await expect(card.getByTestId('my-plan-type-tuesday-morning-tigerwolves')).toBeVisible()

    // "Show details" expands the card.
    const showBtn = card.getByRole('button', { name: 'Show details' })
    await expect(showBtn).toBeVisible()
    await showBtn.click()

    // Expanded panel now contains the reason text and the toggle has flipped.
    await expect(card.getByText('race-specific coordination')).toBeVisible()
    await expect(card.getByRole('button', { name: 'Hide details' })).toBeVisible()
  })

  test('My Plan: reactions picker opens, a pick closes it', async ({ page }) => {
    await setFollow(page, 'monday-morning-easy-run', true)
    await page.goto('/my-plan')
    await page.waitForLoadState('load')

    const card = page.locator('[data-testid^="my-plan-card-monday-morning-easy-run-"]').first()

    // Open the picker.
    await card.locator('button', { hasText: 'React' }).click()

    // Picker is open — individual emoji reaction buttons are visible.
    const emoji = page.locator('button[aria-label^="React "]').first()
    await expect(emoji).toBeVisible()

    // Picking an emoji closes the picker.
    await emoji.click()
    await expect(page.locator('button[aria-label^="React "]')).toHaveCount(0)
  })

  // ── Per-run schedule cards (GroupRunCard) ─────────────────────────────────

  test('Schedule (per-run): card expands and collapses; Edit schedule nav works', async ({ page }) => {
    await page.goto('/runs/tuesday-morning-tigerwolves')
    await page.waitForLoadState('load')

    const card = page.locator('[data-testid="schedule-card-0"]')

    // Expand on first click.
    await card.click()
    await expect(page.locator('[data-testid="schedule-detail-0"]')).toBeVisible()

    // Collapse on second click.
    await card.click()
    await expect(page.locator('[data-testid="schedule-detail-0"]')).not.toBeVisible()

    // "Edit schedule →" link is present and navigates to /schedule?week=0.
    const editBtn = page.locator('[data-testid="schedule-week-0"]')
    await expect(editBtn).toContainText('Edit schedule')
    await editBtn.click()
    await page.waitForURL(/\/schedule\?week=0/)
  })

  // ── View-route link (MMER — Easy run with a route) ───────────────────────
  // tuesday-morning-tigerwolves is an Intervals run and has no route link, so
  // schedule-route-0 would never be asserted against that run.  MMER carries a
  // route and the link is visible in the collapsed state (per-run.spec.ts:200).

  test('Schedule (per-run): View-route link present on a run that has one (MMER)', async ({ page }) => {
    await page.goto('/runs/monday-morning-easy-run')
    await page.waitForLoadState('load')

    await expect(page.locator('[data-testid="schedule-route-0"]')).toContainText('View route')
  })

  // ── Past-card leader "Edit in library" ────────────────────────────────────
  // The e2e seed has no past-history rows for tuesday-morning-tigerwolves
  // (confirmed by per-run.spec.ts: 'fixture has no past history — past-card
  // testids never appear'). The test skips when no past card is present so it
  // never fails on current fixtures, but the assertion is ready for the day
  // past data exists.

  test('Schedule (per-run): past card exposes leader "Edit in library" and it navigates', async ({ page }) => {
    await page.goto('/runs/tuesday-morning-tigerwolves')
    await page.waitForLoadState('load')

    const editInLib = page.locator('[data-testid="edit-in-library-0"]')
    if (await editInLib.count() === 0) {
      test.skip(true, 'no past card with a workout in fixtures')
      return
    }

    await expect(editInLib).toContainText('Edit in library')
    await editInLib.click()
    await page.waitForURL(/\/library\/edit\?variantId=/)
  })
})
