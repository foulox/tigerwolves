import { test, expect } from '@playwright/test'

test('Library "Your run" mode shows only the run\'s own workouts across categories (run_group scoping, #401 AC1)', async ({ page }) => {
  await page.goto('/library')
  await page.waitForLoadState('load')

  // Default view is "Your run" mode: every workout owned by the TigerWolves
  // run_group, ACROSS categories (Quality + the Easy/Long fixtures TW owns). The
  // category selector is available in this mode to narrow further. The 8 count is
  // the 7 TigerWolves-owned families (McCarren Loop Repeats contributes 2 variant rows).
  const countEl = page.locator('p').filter({ hasText: /workouts · oldest first/ })
  await expect(countEl).toHaveText('8 workouts · oldest first')

  await expect(page.getByText('Yasso 800s')).toBeVisible()
  await expect(page.getByText('Fort Greene Hills')).toBeVisible()
  await expect(page.getByText('Prospect Park Tempo')).toBeVisible()
  await expect(page.getByText('Track Ladder 400-800-1200')).toBeVisible()
  // TigerWolves owns these Easy/Long fixtures too — now visible in "Your run" (group scope, not category).
  await expect(page.getByText('Easy Recovery Run')).toBeVisible()
  await expect(page.getByText('Long Run — Progressive')).toBeVisible()

  // Another run's workout (MMER owns "McCarren Easy Loop") is NOT visible in "Your
  // run" — the core of per-run scoping. It's reachable via "All runs" (next test — AC2).
  await expect(page.getByText('McCarren Easy Loop')).toHaveCount(0)
})

test('Library "All runs" mode reveals the full shared catalog incl. other runs, and the category filter narrows to Quality (#401 AC2)', async ({ page }) => {
  await page.goto('/library')
  await page.waitForLoadState('load')

  // Switch to "All runs" — shared catalog, all categories, category selector visible.
  await page.getByRole('button', { name: 'All runs', exact: true }).click()

  // TigerWolves' own Easy/Long families now appear (AC4: no content loss).
  await expect(page.getByText('Easy Recovery Run')).toBeVisible()
  await expect(page.getByText('Long Run — Progressive')).toBeVisible()

  // Another run's workout also appears (AC2: shared pool).
  await expect(page.getByText('McCarren Easy Loop')).toBeVisible()

  // Category selector is now visible in "All runs" mode — filter to Quality.
  await page.getByRole('button', { name: 'Quality', exact: true }).click()

  // Easy, Long, and the other run's Easy workout drop out of the Quality-filtered view.
  await expect(page.getByText('Easy Recovery Run')).toHaveCount(0)
  await expect(page.getByText('Long Run — Progressive')).toHaveCount(0)
  await expect(page.getByText('McCarren Easy Loop')).toHaveCount(0)

  // Quality rows stay visible — spot-check one.
  await expect(page.getByText('Fort Greene Hills')).toBeVisible()

  // No exact total-count assertion here: the shared catalog can grow as more runs
  // are added, so a hard number would become a maintenance burden.
})

// #354: duplicate-name detection on create. Non-mutating (never saves), so it's
// safe to run alongside the count tests above and before the mutating ones below.
test('Add workout: a duplicate name surfaces the existing family and offers to add a variation (#354)', async ({ page }) => {
  await page.goto('/library/add')
  await page.waitForLoadState('load')

  // Enter a name that already exists (a seeded TigerWolves family). Category +
  // Type are required before "Next" is enabled; Instructions is a required field.
  await page.getByPlaceholder('e.g. Hills', { exact: false }).fill('Yasso 800s')
  await page.getByRole('button', { name: 'Quality', exact: true }).click()
  await page.getByRole('button', { name: 'Intervals', exact: true }).click()
  await page.getByPlaceholder('WU:', { exact: false }).fill('WU 10; Main 8x800; CD 10')
  await page.getByRole('button', { name: 'Next', exact: false }).click()

  // The collision surface appears instead of the AI-inference step.
  await expect(page.getByRole('heading', { name: 'Already in the library' })).toBeVisible()
  await expect(page.getByText(/A workout called/)).toBeVisible()

  // "Add a variation" routes into the existing family's add-variation flow.
  const cta = page.getByRole('link', { name: /Add a variation to/ })
  await expect(cta).toHaveAttribute('href', /\/library\/add\?parent=\d+/)

  // "Use a different name" returns to the entry form (no workout created).
  await page.getByRole('button', { name: 'Use a different name' }).click()
  await expect(page.getByRole('heading', { name: 'New Workout' })).toBeVisible()
})

// Appended below the count-assertion tests above (not interspersed) — these two
// mutate fixture state (adds a variant, clears a flag), so they must run after
// anything in this file/suite that counts fixture rows by name.

test('Add variation: a new variation shows up immediately in Library AND on Plan (#277 — closes the addVariation split-brain gap)', async ({ page }) => {
  await page.goto('/library')
  await page.waitForLoadState('load')

  const card = page.locator('.bg-white.rounded-2xl', { hasText: 'Prospect Park Tempo' })
  await card.getByText('+ Add variation').click()

  await page.waitForLoadState('load')
  await expect(page.getByRole('heading', { name: 'Add Variation' })).toBeVisible()
  await page.getByPlaceholder('e.g. 3×2mi@HMP, r3min').fill('12min tempo instead of 20min')
  await page.getByRole('button', { name: 'Save Variation' }).click()

  await page.waitForURL(/\/library/)
  await page.waitForLoadState('load')
  const familyCard = page.locator('.bg-white.rounded-2xl', { hasText: 'Prospect Park Tempo' })
  await expect(familyCard.getByText('2 versions')).toBeVisible()

  // Schedule's browse picker searches this run's own library regardless of the
  // scheduled week's workout type — Prospect Park Tempo is a TigerWolves-owned
  // workout, so the new variant is visible there too, not just in the Library
  // (the other half of the addWorkout/addVariation split-brain). Post-#401 the
  // picker is run_group-scoped, and this workout is in the run's own group.
  await page.goto('/schedule?week=0')
  await page.waitForLoadState('load')
  const browseTab = page.getByRole('button', { name: 'Change workout', exact: true })
  if (await browseTab.isVisible()) await browseTab.click()
  await page.locator('input[type="search"]').fill('Prospect Park Tempo')
  await expect(page.getByText('12min tempo instead of 20min')).toBeVisible()
})

test('Flag round trip: leader reviews a reported issue and saves a fix, clearing the flag (#277 — variant_id write path)', async ({ page }) => {
  await page.goto('/library')
  await page.waitForLoadState('load')

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
  await page.waitForLoadState('load')
  await expect(page.getByRole('button', { name: 'Issue reported — view details' })).toHaveCount(0)
})

// #404: adopt a route from another run's library into your own, then un-adopt it.
// Mutating (adds/removes a run_workouts row) — appended last, and it restores state
// by un-adopting at the end so the count-assertion tests above stay valid on replay.
// The test leader leads exactly one run (tigerwolves), so adopt is a direct tap with
// no "which run?" picker.
test('Adopt: a route from "All runs" appears in "Your run", marked adopted, and can be removed (#404)', async ({ page }) => {
  await page.goto('/library')
  await page.waitForLoadState('load')

  // Baseline: MMER's "McCarren Easy Loop" is NOT in TigerWolves' "Your run" library.
  await expect(page.getByText('McCarren Easy Loop')).toHaveCount(0)

  // Find it under "All runs" and adopt it into our run.
  await page.getByRole('button', { name: 'All runs', exact: true }).click()
  const allRunsCard = page.locator('.bg-white.rounded-2xl', { hasText: 'McCarren Easy Loop' })
  await expect(allRunsCard).toBeVisible()
  await allRunsCard.getByRole('button', { name: '+ Add to my run' }).click()
  // After adopting, the add affordance is gone for that card (it's now in the library).
  await expect(allRunsCard.getByRole('button', { name: '+ Add to my run' })).toHaveCount(0)

  // Switch to "Your run": the adopted route now shows, marked with its creator.
  await page.getByRole('button', { name: 'Your run', exact: true }).click()
  const yourRunCard = page.locator('.bg-white.rounded-2xl', { hasText: 'McCarren Easy Loop' })
  await expect(yourRunCard).toBeVisible()
  await expect(yourRunCard.getByText(/adopted from MMER/)).toBeVisible()

  // Remove from my run (un-adopt) — it drops back out of "Your run".
  await yourRunCard.getByRole('button', { name: 'Remove from my run' }).click()
  await expect(page.getByText('McCarren Easy Loop')).toHaveCount(0)
})
