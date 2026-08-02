import { test, expect } from '@playwright/test'

test('Plan page for the already-planned week shows the Heylo post with fixture content', async ({ page }) => {
  await page.goto('/plan?week=0')
  await page.waitForLoadState('networkidle')

  await expect(page.getByRole('button', { name: 'Post draft', exact: true })).toBeVisible()
  const post = page.locator('pre').first()
  await expect(post).toContainText('Yasso 800s')
  await expect(post).toContainText('10x800m @ 5K effort')
  await expect(page.getByRole('button', { name: /copy to clipboard/i })).toBeVisible()
})

test('Plan page for the unplanned week lets a leader pick a fixture workout and generates its Heylo post', async ({ page }) => {
  await page.goto('/plan?week=2')
  await page.waitForLoadState('networkidle')

  // No workout planned yet for this week — the picker shows directly, no tabs.
  await expect(page.getByRole('button', { name: 'Post draft', exact: true })).toHaveCount(0)

  await page.locator('button').filter({ hasText: 'Fort Greene Hills' }).first().click()

  const post = page.locator('pre').first()
  await expect(post).toContainText('Fort Greene Hills')
  await expect(post).toContainText('8x90sec hill repeats')
})

test('Plan page tab switch: Post draft is default, Change workout reveals the picker, and switching back preserves the post', async ({ page }) => {
  await page.goto('/plan?week=0')
  await page.waitForLoadState('networkidle')

  const postTab = page.getByRole('button', { name: 'Post draft', exact: true })
  const browseTab = page.getByRole('button', { name: 'Change workout', exact: true })

  // Default view: Post draft tab active, showing the post + Copy button, no search bar
  await expect(page.getByRole('button', { name: /copy to clipboard/i })).toBeVisible()
  await expect(page.locator('input[type="search"]')).not.toBeVisible()

  // Switching to Change workout reveals the search bar and browse list, hides the post
  await browseTab.click()
  await expect(page.locator('input[type="search"]')).toBeVisible()
  await expect(page.getByRole('button', { name: /copy to clipboard/i })).not.toBeVisible()

  // Switching back to Post draft restores the post view, still the fixture's workout
  await postTab.click()
  await expect(page.getByRole('button', { name: /copy to clipboard/i })).toBeVisible()
  await expect(page.locator('input[type="search"]')).not.toBeVisible()
  await expect(page.locator('pre').first()).toContainText('Yasso 800s')
})
