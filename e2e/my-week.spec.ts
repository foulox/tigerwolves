import { test, expect, type Page } from '@playwright/test'

// My Week (#331) — the cross-run home at /my-week. Auth-required; follow-based.
//
// The default project runs signed in as the TigerWolves test-leader (see
// playwright.config.ts storageState + e2e/auth.setup.ts). My Week is purely
// follow-driven in R3 (no auto-present-own-run — that's R4), so the leader must
// explicitly follow runs to see them. The seed (scripts/seed-e2e.ts) clears the
// leader's tigerwolves + mmer follows at the start of each run, and seeds MMER as
// a real Easy run (Monday schedule + route) alongside TigerWolves (Workout).
//
// Each test sets its own follow state via /all-runs so order doesn't matter.

// Join/leave a platform run from the All Runs directory to reach a known state.
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

test.describe('My Week (/my-week) — signed-in runner', () => {
  test('zero follows → empty prompt linking to /all-runs', async ({ page }) => {
    await setFollow(page, 'tigerwolves', false)
    await setFollow(page, 'mmer', false)

    await page.goto('/my-week')
    await page.waitForLoadState('load')

    const empty = page.locator('[data-testid="my-week-empty"]')
    await expect(empty).toBeVisible()
    await expect(page.locator('[data-testid="my-week-empty-cta"]')).toHaveAttribute('href', '/all-runs')
    // No feed when following nothing.
    await expect(page.locator('[data-testid^="my-week-card-"]')).toHaveCount(0)
  })

  test('shows cross-run cards grouped by day, with kind-aware compact bodies', async ({ page }) => {
    await setFollow(page, 'tigerwolves', true)
    await setFollow(page, 'mmer', true)

    await page.goto('/my-week')
    await page.waitForLoadState('load')

    const tigerCard = page.locator('[data-testid^="my-week-card-tigerwolves-"]').first()
    const mmerCard = page.locator('[data-testid^="my-week-card-mmer-"]').first()
    await expect(tigerCard).toBeVisible()
    await expect(mmerCard).toBeVisible()

    // Both sit under day-group sections (grouped by day).
    expect(await page.locator('[data-testid^="day-group-"]').count()).toBeGreaterThan(0)

    // TigerWolves (Workout kind) → type pill + short set line, no route link.
    await expect(page.locator('[data-testid="my-week-type-tigerwolves"]')).toContainText('Interval')
    await expect(page.locator('[data-testid="my-week-set-tigerwolves"]')).toContainText('10x800m @ 5K effort')
    await expect(page.locator('[data-testid="my-week-route-tigerwolves"]')).toHaveCount(0)

    // MMER (Easy/route kind) → distance + "View route ↗", no type pill.
    await expect(page.locator('[data-testid="my-week-distance-mmer"]')).toContainText('4 miles')
    await expect(page.locator('[data-testid="my-week-route-mmer"]')).toContainText('View route')
    await expect(page.locator('[data-testid="my-week-type-mmer"]')).toHaveCount(0)
  })

  test('cards start collapsed; tap toggles the expanded panel (reuses WorkoutDetails)', async ({ page }) => {
    await setFollow(page, 'tigerwolves', true)

    await page.goto('/my-week')
    await page.waitForLoadState('load')

    const detail = page.locator('[data-testid="my-week-detail-tigerwolves"]')
    await expect(detail).toHaveCount(0) // collapsed by default

    await page.locator('[data-testid^="my-week-card-tigerwolves-"]').first().click()
    await expect(detail).toBeVisible()
    await expect(detail).toContainText('Instructions')
  })

  test('date strip navigates the whole view forward/back one week', async ({ page }) => {
    await setFollow(page, 'tigerwolves', true)
    await setFollow(page, 'mmer', true)

    await page.goto('/my-week')
    await page.waitForLoadState('load')

    const mmerCard = page.locator('[data-testid^="my-week-card-mmer-"]')
    const rangeLabel = page.locator('[data-testid="week-range-label"]')
    await expect(mmerCard.first()).toBeVisible()
    const week0 = await rangeLabel.textContent()

    // Forward a week — a different week is shown (MMER's only entry is this week).
    await page.locator('[data-testid="week-next"]').click()
    await expect(rangeLabel).not.toHaveText(week0 ?? '')
    await expect(mmerCard).toHaveCount(0)

    // Back a week — returns to the current week and MMER is visible again.
    await page.locator('[data-testid="week-prev"]').click()
    await expect(rangeLabel).toHaveText(week0 ?? '')
    await expect(mmerCard.first()).toBeVisible()
  })

  test('rate in place via the ReactionPicker on a card', async ({ page }) => {
    await setFollow(page, 'mmer', true)

    await page.goto('/my-week')
    await page.waitForLoadState('load')

    const card = page.locator('[data-testid^="my-week-card-mmer-"]').first()
    const reactBtn = card.locator('button', { hasText: 'React' })
    await reactBtn.click()
    // Picker opens with emoji options, then a pick closes it.
    const emoji = page.locator('button[aria-label^="React "]').first()
    await expect(emoji).toBeVisible()
    await emoji.click()
    await expect(page.locator('button[aria-label^="React "]')).toHaveCount(0)
  })

  test('run name links to that run\'s per-run page', async ({ page }) => {
    await setFollow(page, 'mmer', true)

    await page.goto('/my-week')
    await page.waitForLoadState('load')

    await page.locator('[data-testid="my-week-run-link-mmer"]').first().click()
    await page.waitForURL(/\/runs\/mmer/)
    expect(page.url()).toContain('/runs/mmer')
  })
})

test.describe('My Week (/my-week) — auth required', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('logged-out visit redirects to sign-in', async ({ page }) => {
    await page.goto('/my-week')
    await page.waitForURL(/\/sign-in/)
    expect(page.url()).toContain('/sign-in')
  })
})
