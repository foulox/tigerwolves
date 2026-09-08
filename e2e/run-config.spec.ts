import { test, expect } from '@playwright/test'

test.describe('Run Settings', () => {
  // storageState defaults to e2e/.auth/user.json via playwright.config.ts project config
  // The seeded test leader has the 'leader' role set in Clerk publicMetadata.

  test('Run Settings link appears in Clerk UserButton menu', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    // Run Settings is a Clerk UserButton.Link, not a hamburger menu link.
    // The UserButton renders as an avatar button; click it to open the dropdown.
    // Clerk's rendered class is .cl-userButtonTrigger; data-testid fallbacks are also tried.
    // NOTE: exact selector may need tuning against a live Preview URL — Clerk's DOM
    // class names are stable across minor versions but verify if this fails after a
    // Clerk SDK upgrade.
    const trigger =
      page.locator('[data-testid="user-button-trigger"]').first().or(
        page.locator('.cl-userButtonTrigger').first()
      )
    await trigger.click()
    await expect(page.getByRole('menuitem', { name: /run settings/i })
      .or(page.getByText(/run settings/i))).toBeVisible()
  })

  test('post template saves and persists', async ({ page }) => {
    await page.goto('/run-config')
    await page.waitForLoadState('networkidle')

    const input = page.getByLabel(/meeting location/i)
    const original = await input.inputValue()
    await input.fill('Test Location Updated')
    await page.getByRole('button', { name: /save changes/i }).click()
    await expect(page.getByRole('button', { name: /saved/i })).toBeVisible()

    // Reload and verify persistence
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.getByLabel(/meeting location/i)).toHaveValue('Test Location Updated')

    // Restore original value
    await input.fill(original)
    await page.getByRole('button', { name: /save changes/i }).click()
    await expect(page.getByRole('button', { name: /saved/i })).toBeVisible()
  })

  test('away period save shows confirmation banner', async ({ page }) => {
    await page.goto('/run-config')
    await page.waitForLoadState('networkidle')

    // Switch to the Roster tab
    await page.getByRole('button', { name: 'Roster' }).click()

    // Open the away panel for the first leader in the list
    await page.getByRole('button', { name: /away/i }).first().click()

    await page.getByLabel('From').fill('2099-01-01')
    await page.getByLabel('To').fill('2099-01-07')
    await page.getByRole('button', { name: /save away period/i }).click()

    await expect(page.getByText(/away period saved/i)).toBeVisible()
  })
})
