import { test, expect } from '@playwright/test'

// #413: admin directory lifecycle (add → edit → activate → manage-nav).
// Runs as the test-leader storageState, which auth.setup.ts stamps with
// publicMetadata.admin === true so the admin controls render on /all-runs.
// The fixture run 'sunday-e2e-testers' is created by this spec and cleaned
// up by scripts/seed-e2e.ts on the next run (self-heal pattern).
test('admin adds, edits, activates, and navigates to full settings', async ({ page }) => {
  test.setTimeout(90000)
  await page.goto('/all-runs')
  await page.waitForLoadState('load')

  // Step 1: Add — open the drawer and create a new unclaimed run.
  // The drawer defaults category='Workouts' and day='Monday', so name+distance is enough.
  await page.getByTestId('admin-add-run').click()
  await page.getByLabel(/run name/i).fill('Sunday E2E Testers')
  await page.getByLabel(/distance/i).fill('5 mi')
  await page.getByRole('button', { name: /save/i }).click()
  await expect(page.getByText('Sunday E2E Testers')).toBeVisible()

  // Step 2: Edit — open the edit drawer and add a location.
  await page.getByTestId('admin-edit-sunday-e2e-testers').click()
  await page.getByLabel(/location/i).fill('Prospect Park')
  await page.getByRole('button', { name: /save/i }).click()
  await expect(page.getByText('Prospect Park')).toBeVisible()

  // Step 3: Activate — toggle open the email form, fill the leader email,
  // then click the submit button (disambiguated from the toggle via testid —
  // both buttons have text matching /activate/i, which would be a strict-mode
  // conflict without the testid on the submit).
  await page.getByTestId('admin-activate-sunday-e2e-testers').click()
  await page.getByLabel(/email/i).fill(process.env.PLAYWRIGHT_TEST_EMAIL!)
  await page.getByTestId('admin-activate-submit-sunday-e2e-testers').click()
  // After activation the run becomes 'draft' → canManage is true → Manage link appears.
  await expect(page.getByTestId('admin-manage-sunday-e2e-testers')).toBeVisible()

  // Step 4: Manage — navigate to the full run-settings screen.
  await page.getByTestId('admin-manage-sunday-e2e-testers').click()
  await expect(page).toHaveURL(/\/admin\/runs\/sunday-e2e-testers/)
})
