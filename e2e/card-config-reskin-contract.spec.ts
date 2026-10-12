import { test, expect } from '@playwright/test'

// Leader storageState (e2e/.auth/user.json) is the default project config.
// Characterization lock for epic #510 Story 5: the NBR reskin of the
// card-layout config screen must preserve every interactive control. Asserts
// behavior by accessible name — never Tailwind classes — so it survives the
// reskin (epic #510 testing rule).

async function openCardLayoutTab(page: import('@playwright/test').Page) {
  await page.goto('/run-config')
  await page.waitForLoadState('load')
  // Run Settings opens on "About the run"; the card editor is under "Card layout".
  await page.getByRole('button', { name: 'Card layout' }).click()
}

test.describe('card-layout config — interactive contract', () => {
  test('hidden bin: a field moves to Hidden and back', async ({ page }) => {
    await openCardLayoutTab(page)

    // "Description" ships in the upfront section (default template). Its chip
    // exposes a "Move Description to hidden" control.
    await page.getByRole('button', { name: 'Move Description to hidden' }).click()

    // It now lives in the Hidden bin, which exposes the inverse controls.
    const backToUpfront = page.getByRole('button', { name: 'Move Description to Show upfront' })
    await expect(backToUpfront).toBeVisible()

    // Move it back — the hidden-bin control is wired.
    await backToUpfront.click()
    await expect(page.getByRole('button', { name: 'Move Description to hidden' })).toBeVisible()
  })

  test('row move controls: edges disabled, middle enabled and wired', async ({ page }) => {
    await openCardLayoutTab(page)

    // Row 1 up is disabled (top edge); a middle row's up is enabled.
    await expect(page.getByRole('button', { name: 'Move row 1 up in Show upfront' })).toBeDisabled()
    const row2up = page.getByRole('button', { name: 'Move row 2 up in Show upfront' })
    await expect(row2up).toBeEnabled()

    // Clicking it reorders without crashing; row labels renumber so the
    // control set is still present afterward (the editor stayed mounted/wired).
    await row2up.click()
    await expect(page.getByRole('button', { name: 'Move row 1 up in Show upfront' })).toBeDisabled()

    // Split: "Distance & elevation" shares a row with others in the default
    // template, so its split control is a real (non-no-op) operation.
    await expect(
      page.getByRole('button', { name: 'Split Distance & elevation to its own row' }),
    ).toBeEnabled()
  })

  test('alignment toggle persists across save + reload', async ({ page }) => {
    await openCardLayoutTab(page)

    // "Author" is a lone-field row in the default template — toggling its
    // alignment never reorders rows, so the save round-trips to an identical
    // template once restored. aria-pressed is the class-free observable.
    const leftBtn = page.getByRole('button', { name: 'Align Author left' })
    const rightBtn = page.getByRole('button', { name: 'Align Author right' })

    const startedLeft = (await leftBtn.getAttribute('aria-pressed')) === 'true'
    const target = startedLeft ? rightBtn : leftBtn
    const targetName = startedLeft ? 'Align Author right' : 'Align Author left'

    await target.click()
    await expect(page.getByRole('button', { name: targetName })).toHaveAttribute('aria-pressed', 'true')

    await page.getByRole('button', { name: /save card layout/i }).click()
    await expect(page.getByRole('button', { name: /saved!/i })).toBeVisible()

    // Reload lands on the About tab — reopen Card layout and confirm the edit
    // survived the DB round-trip.
    await page.reload()
    await page.waitForLoadState('load')
    await page.getByRole('button', { name: 'Card layout' }).click()
    await expect(page.getByRole('button', { name: targetName })).toHaveAttribute('aria-pressed', 'true')

    // Restore the original alignment and save so the serial suite is untouched.
    const restoreName = startedLeft ? 'Align Author left' : 'Align Author right'
    await page.getByRole('button', { name: restoreName }).click()
    await page.getByRole('button', { name: /save card layout/i }).click()
    await expect(page.getByRole('button', { name: /saved!/i })).toBeVisible()
  })

  test('live preview: picker and surface tabs are wired', async ({ page }) => {
    await openCardLayoutTab(page)

    const emptyState = page.getByText('Add a workout to your library to preview')
    if (await emptyState.isVisible().catch(() => false)) {
      // No library workouts seeded for this run — nothing to drive. The
      // empty-state copy itself is the contract in that case.
      return
    }

    // Picker opens.
    const picker = page.getByRole('button', { name: 'Choose a workout to preview' })
    await picker.click()
    await expect(picker).toHaveAttribute('aria-expanded', 'true')
    // Close it (click again) before driving surface tabs.
    await picker.click()

    // Surface tabs switch the preview frame — "Schedule" shows "Currently planned".
    await page.getByRole('button', { name: 'Schedule', exact: true }).click()
    await expect(page.getByText('Currently planned')).toBeVisible()
    await page.getByRole('button', { name: 'My Plan', exact: true }).click()
    await expect(page.getByText('Currently planned')).toHaveCount(0)
  })
})
