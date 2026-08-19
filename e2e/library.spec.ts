import { test, expect } from '@playwright/test'

test('Library page loads with all 8 fixture workout names', async ({ page }) => {
  await page.goto('/library')
  await page.waitForLoadState('networkidle')

  const countEl = page.locator('p').filter({ hasText: /workouts · oldest first/ })
  await expect(countEl).toHaveText('8 workouts · oldest first')

  await expect(page.getByText('Easy Recovery Run')).toBeVisible()
  await expect(page.getByText('Long Run — Progressive')).toBeVisible()
  await expect(page.getByText('Yasso 800s')).toBeVisible()
  await expect(page.getByText('Fort Greene Hills')).toBeVisible()
  await expect(page.getByText('Prospect Park Tempo')).toBeVisible()
  await expect(page.getByText('Track Ladder 400-800-1200')).toBeVisible()
  // The two McCarren Loop Repeats rows are reserved for admin.spec.ts's regroup
  // test and asserted there — not here. admin.spec.ts renames them in place,
  // and since these specs share one seeded suite run (not reset per test),
  // asserting their original name here would be order-dependent.
})

test('Library category filter narrows to exactly the 6 Quality-category rows', async ({ page }) => {
  await page.goto('/library')
  await page.waitForLoadState('networkidle')

  const countEl = page.locator('p').filter({ hasText: /workouts · oldest first/ })
  await expect(countEl).toHaveText('8 workouts · oldest first')

  await page.getByRole('button', { name: 'Quality', exact: true }).click()
  await expect(countEl).toHaveText('6 workouts · oldest first')

  // Easy/Long baseline workouts must drop out of the filtered view
  await expect(page.getByText('Easy Recovery Run')).toHaveCount(0)
  await expect(page.getByText('Long Run — Progressive')).toHaveCount(0)
  await expect(page.getByText('Fort Greene Hills')).toBeVisible()
})

// Appended below the count-assertion tests above (not interspersed) — these two
// mutate fixture state (adds a variant, clears a flag), so they must run after
// anything in this file/suite that counts fixture rows by name.

test('Add variation: a new variation shows up immediately in Library AND on Plan (#277 — closes the addVariation split-brain gap)', async ({ page }) => {
  await page.goto('/library')
  await page.waitForLoadState('networkidle')

  const card = page.locator('.bg-white.rounded-2xl', { hasText: 'Prospect Park Tempo' })
  await card.getByText('+ Add variation').click()

  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('heading', { name: 'Add Variation' })).toBeVisible()
  await page.getByPlaceholder('e.g. 3×2mi@HMP, r3min').fill('12min tempo instead of 20min')
  await page.getByRole('button', { name: 'Save Variation' }).click()

  await page.waitForURL(/\/library/)
  await page.waitForLoadState('networkidle')
  const familyCard = page.locator('.bg-white.rounded-2xl', { hasText: 'Prospect Park Tempo' })
  await expect(familyCard.getByText('2 versions')).toBeVisible()

  // Plan's browse picker searches the full library regardless of the scheduled
  // week's workout type — proves the new variant is visible there too, not just
  // in the Library (the other half of the addWorkout/addVariation split-brain).
  await page.goto('/plan?week=0')
  await page.waitForLoadState('networkidle')
  const browseTab = page.getByRole('button', { name: 'Change workout', exact: true })
  if (await browseTab.isVisible()) await browseTab.click()
  await page.locator('input[type="search"]').fill('Prospect Park Tempo')
  await expect(page.getByText('12min tempo instead of 20min')).toBeVisible()
})

test('Flag round trip: leader reviews a reported issue and saves a fix, clearing the flag (#277 — variant_id write path)', async ({ page }) => {
  await page.goto('/library')
  await page.waitForLoadState('networkidle')

  await page.getByRole('button', { name: 'Issue reported — view details' }).click()
  await expect(page.getByRole('heading', { name: 'Review & fix' })).toBeVisible()
  await expect(page.getByText("We've actually been running 8 reps lately")).toBeVisible()

  await page.getByRole('button', { name: 'Save fix & clear flag' }).click()
  // The sheet closes client-side as soon as the action resolves, but the
  // server's unstable_cache tag invalidation (updateTag) can trail slightly
  // behind that in local dev — wait for the sheet to actually close before
  // reloading, rather than racing a fixed reload against an in-flight action.
  await expect(page.getByRole('heading', { name: 'Review & fix' })).not.toBeVisible()

  await page.reload()
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('button', { name: 'Issue reported — view details' })).toHaveCount(0)
})
