import { test, expect, type Page } from '@playwright/test'

// #332 Home flip — the `/` router: it redirects rather than rendering a page.
//   logged out            → /all-runs
//   signed in, 0 follows   → /all-runs
//   signed in, ≥1 follow   → /my-plan
//
// Signed-in cases use the default TigerWolves test-leader context. Follow state is
// set via /all-runs, which — unlike /my-plan — does NOT trigger the leader
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
    await setFollow(page, 'tuesday-morning-tigerwolves', false)
    await setFollow(page, 'monday-morning-easy-run', false)

    await page.goto('/')
    await page.waitForURL(/\/all-runs$/)
    expect(page.url()).toContain('/all-runs')
  })

  test('≥1 follow → redirects to /my-plan', async ({ page }) => {
    // Clear the led run, follow only MMER — exactly one follow, so the branch is
    // driven by the follow count, not the leader auto-follow.
    await setFollow(page, 'tuesday-morning-tigerwolves', false)
    await setFollow(page, 'monday-morning-easy-run', true)

    await page.goto('/')
    await page.waitForURL(/\/my-plan$/)
    expect(page.url()).toContain('/my-plan')

    // Cleanup: this suite shares the one test-leader account with other specs
    // (e.g. per-run's join-MMER test), so leave MMER un-followed rather than
    // leaking a follow downstream — the leak that made per-run.spec.ts flaky.
    await setFollow(page, 'monday-morning-easy-run', false)
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
