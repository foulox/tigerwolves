import { test, expect } from '@playwright/test'

test.describe('Run Settings', () => {
  // storageState defaults to e2e/.auth/user.json via playwright.config.ts project config
  // The seeded test leader has the 'leader' role set in Clerk publicMetadata.

  test('Run Settings + Admin appear in the leader hamburger menu', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('load')
    // Run Settings + Admin live in the leader-only hamburger (LeaderMenu.tsx),
    // opened from the header button labelled "Leader menu".
    await page.getByRole('button', { name: 'Leader menu' }).click()
    await expect(page.getByRole('menuitem', { name: /run settings/i })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /admin/i })).toBeVisible()
  })

  test('post template saves and persists', async ({ page }) => {
    await page.goto('/run-config')
    await page.waitForLoadState('load')

    const input = page.getByLabel(/meeting location/i)
    const original = await input.inputValue()
    await input.fill('Test Location Updated')
    await page.getByRole('button', { name: /save changes/i }).click()
    await expect(page.getByRole('button', { name: /saved/i })).toBeVisible()

    // Reload and verify persistence
    await page.reload()
    await page.waitForLoadState('load')
    await expect(page.getByLabel(/meeting location/i)).toHaveValue('Test Location Updated')

    // Restore original value
    await input.fill(original)
    await page.getByRole('button', { name: /save changes/i }).click()
    await expect(page.getByRole('button', { name: /saved/i })).toBeVisible()
  })

  test('away period save shows confirmation banner', async ({ page }) => {
    await page.goto('/run-config')
    await page.waitForLoadState('load')

    // Switch to the Roster tab
    await page.getByRole('button', { name: 'Roster' }).click()

    // Open the away panel for the first leader in the list
    await page.getByRole('button', { name: /away/i }).first().click()

    // exact match: getByLabel does substring matching by default, and "To" would
    // otherwise also match the "How to use this" header button.
    await page.getByLabel('From', { exact: true }).fill('2099-01-01')
    await page.getByLabel('To', { exact: true }).fill('2099-01-07')
    await page.getByRole('button', { name: /save away period/i }).click()

    await expect(page.getByText(/away period saved/i)).toBeVisible()
  })
})
