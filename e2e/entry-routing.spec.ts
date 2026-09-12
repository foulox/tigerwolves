import { test, expect, type Page } from '@playwright/test'

// #332 Home flip — the `/` router: it redirects rather than rendering a page.
//   logged out            → /all-runs
//   signed in, 0 follows   → /all-runs
//   signed in, ≥1 follow   → /my-week
//
// Signed-in cases use the default TigerWolves test-leader context. Follow state is
// set via /all-runs, which — unlike /my-week — does NOT trigger the leader
// auto-follow, so the 0-follow case stays deterministic. Suite runs workers:1,
// so each test's setFollow-to-known-state holds through its assertions.

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

test.describe('entry routing (/) — signed-in leader', () => {
  test('0 follows → redirects to /all-runs', async ({ page }) => {
    await setFollow(page, 'tigerwolves', false)
    await setFollow(page, 'mmer', false)

    await page.goto('/')
    await page.waitForURL(/\/all-runs$/)
    expect(page.url()).toContain('/all-runs')
  })

  test('≥1 follow → redirects to /my-week', async ({ page }) => {
    // Clear the led run, follow only MMER — exactly one follow, so the branch is
    // driven by the follow count, not the leader auto-follow.
    await setFollow(page, 'tigerwolves', false)
    await setFollow(page, 'mmer', true)

    await page.goto('/')
    await page.waitForURL(/\/my-week$/)
    expect(page.url()).toContain('/my-week')
  })
})

test.describe('entry routing (/) — logged out', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('redirects to /all-runs', async ({ page }) => {
    await page.goto('/')
    await page.waitForURL(/\/all-runs$/)
    expect(page.url()).toContain('/all-runs')
  })
})
