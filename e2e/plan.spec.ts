import { test, expect } from '@playwright/test'

test('Plan page loads for authenticated leader', async ({ page }) => {
  await page.goto('/plan')
  await page.waitForLoadState('networkidle')
  // Authenticated leaders see the Plan page content
  await expect(page.locator('body')).toContainText(/plan|workout|picker|schedule/i)
})

test('Plan page shows workout picker and generates Heylo post', async ({ page }) => {
  await page.goto('/plan')
  await page.waitForLoadState('networkidle')

  // Try to click the first selectable workout card
  const firstWorkout = page.locator('button').filter({ hasText: /never|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i }).first()
  if (await firstWorkout.isVisible({ timeout: 5000 }).catch(() => false)) {
    await firstWorkout.click()
    // After selecting, the Heylo post draft should appear
    await expect(page.locator('pre, textarea').first()).not.toBeEmpty()
    // Copy button should be visible
    await expect(page.getByRole('button', { name: /copy/i })).toBeVisible()
  } else {
    // If no workouts are available, at least the page renders without error
    await expect(page.locator('body')).toContainText(/plan|no upcoming|workout/i)
  }
})

test('Plan page tab switch: Post draft is default, Change workout reveals the picker, and switching back preserves the post', async ({ page }) => {
  await page.goto('/plan')
  await page.waitForLoadState('networkidle')

  const postTab = page.getByRole('button', { name: 'Post draft', exact: true })
  const browseTab = page.getByRole('button', { name: 'Change workout', exact: true })

  // Tabs only render once a workout is already planned for the week (State A) —
  // if this week has nothing planned yet (State B), there's nothing to assert here.
  if (!(await postTab.isVisible({ timeout: 5000 }).catch(() => false))) {
    test.skip(true, 'No planned week available in this environment to exercise the tab switch')
    return
  }

  // Default view: Post draft tab active, showing the post + Copy button, no search bar
  await expect(page.getByRole('button', { name: /copy to clipboard/i })).toBeVisible()
  await expect(page.locator('input[type="search"]')).not.toBeVisible()

  // Switching to Change workout reveals the search bar and browse list, hides the post
  await browseTab.click()
  await expect(page.locator('input[type="search"]')).toBeVisible()
  await expect(page.getByRole('button', { name: /copy to clipboard/i })).not.toBeVisible()

  // Switching back to Post draft restores the post view
  await postTab.click()
  await expect(page.getByRole('button', { name: /copy to clipboard/i })).toBeVisible()
  await expect(page.locator('input[type="search"]')).not.toBeVisible()
})
