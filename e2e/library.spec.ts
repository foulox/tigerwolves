import { test, expect } from '@playwright/test'

// #426: fixtures are now a curated subset of REAL production workouts. TigerWolves
// owns 15 single-variant quality-type families (2 of each type, 1 Threshold) plus
// one reserved 2-variant family ("Domino Park Loop") for the admin regroup e2e, so
// the "Your run" count is a deterministic 17 variant rows.
test('Library "Your run" mode shows only the run\'s own workouts across categories (run_group scoping, #401 AC1)', async ({ page }) => {
  await page.goto('/library')
  await page.waitForLoadState('load')

  // Default view is "Your run" mode: every workout TigerWolves owns. 15 single-variant
  // families + 1 two-variant reserved family → 17 rows.
  const countEl = page.locator('p').filter({ hasText: /workouts · oldest first/ })
  await expect(countEl).toHaveText('17 workouts · oldest first')

  // Spot-check a spread of the curated real names across types. Each name is unique
  // (never also a type-pill string), so a bare toBeVisible() stays single-match.
  await expect(page.getByText("300m's on Down")).toBeVisible()
  await expect(page.getByText('Hills - 2 Sets 7x30s')).toBeVisible()
  await expect(page.getByText('The Moneghetti')).toBeVisible()
  await expect(page.getByText('Ladder - 1 to 5 to 1')).toBeVisible()
  await expect(page.getByText('Power Endurance for Elites')).toBeVisible()
  await expect(page.getByText('800s', { exact: true })).toBeVisible()

  // Another run's workout (MMER owns "McCarren Easy Loop") is NOT visible in "Your
  // run" — the core of per-run scoping. It's reachable via "All runs" (next test — AC2).
  await expect(page.getByText('McCarren Easy Loop')).toHaveCount(0)
})

test('Library "All runs" mode reveals the full shared catalog incl. other runs, and the category filter narrows to Quality (#401 AC2)', async ({ page }) => {
  await page.goto('/library')
  await page.waitForLoadState('load')

  // Switch to "All runs" — shared catalog, all categories, category selector visible.
  await page.getByRole('button', { name: 'All runs', exact: true }).click()

  // Other runs' non-Quality workouts now appear: a Doves Long route + MMER's Easy loop.
  await expect(page.getByText('All The Water Fountains')).toBeVisible()
  await expect(page.getByText('McCarren Easy Loop')).toBeVisible()

  // Category selector is now visible in "All runs" mode — filter to Quality.
  await page.getByRole('button', { name: 'Quality', exact: true }).click()

  // The Long route and the other run's Easy workout drop out of the Quality-filtered view.
  await expect(page.getByText('All The Water Fountains')).toHaveCount(0)
  await expect(page.getByText('McCarren Easy Loop')).toHaveCount(0)

  // Quality rows stay visible — spot-check one.
  await expect(page.getByText('Hills - 2 Sets 7x30s')).toBeVisible()

  // No exact total-count assertion here: the shared catalog can grow as more runs
  // are added, so a hard number would become a maintenance burden.
})

// #426 full-e2e coverage: at least one workout of EVERY seeded type is visible in
// the Library. "All runs" mode is used so the Long routes (on the Doves run) show
// alongside TigerWolves' quality types. Each type is asserted two ways: its exact
// type pill and a known real workout of that type.
test('Library shows ≥1 workout of every seeded type (#426 per-type coverage)', async ({ page }) => {
  await page.goto('/library')
  await page.waitForLoadState('load')
  await page.getByRole('button', { name: 'All runs', exact: true }).click()

  const byType: Record<string, string> = {
    Hills: 'Hills - 2 Sets 7x30s',
    'Broken Tempo': '800s',
    Progression: 'Progression w/ Rests',
    Ladder: 'Ladder - 1 to 5 to 1',
    Superset: "Sir Blake's SuperSet",
    'Straight Tempo': 'Straight Tempo',
    Intervals: 'Generic Track Intervals',
    Threshold: 'Power Endurance for Elites',
    Long: 'All The Water Fountains',
  }
  for (const [type, workout] of Object.entries(byType)) {
    await expect(page.getByText(type, { exact: true }).first(), `type pill: ${type}`).toBeVisible()
    await expect(page.getByText(workout).first(), `workout: ${workout}`).toBeVisible()
  }
})

// #354: duplicate-name detection on create. Non-mutating (never saves), so it's
// safe to run alongside the count tests above and before the mutating ones below.
test('Add workout: a duplicate name surfaces the existing family and offers to add a variation (#354)', async ({ page }) => {
  await page.goto('/library/add')
  await page.waitForLoadState('load')

  // Enter a name that already exists (a seeded TigerWolves family). Category +
  // Type are required before "Next" is enabled; Instructions is a required field.
  await page.getByPlaceholder('e.g. Hills', { exact: false }).fill('Generic Track Intervals')
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

  // "Kostas Fartlek" (a single-variant curated Broken Tempo family) — its name
  // never collides with a type pill, so the card locator is unambiguous.
  const card = page.locator('.bg-white.rounded-2xl', { hasText: 'Kostas Fartlek' })
  await card.getByText('+ Add variation').click()

  await page.waitForLoadState('load')
  await expect(page.getByRole('heading', { name: 'Add Variation' })).toBeVisible()
  await page.getByPlaceholder('e.g. 3×2mi@HMP, r3min').fill('ADDED VARIATION — 4x(5min tempo/5min MP)')
  await page.getByRole('button', { name: 'Save Variation' }).click()

  await page.waitForURL(/\/library/)
  await page.waitForLoadState('load')
  const familyCard = page.locator('.bg-white.rounded-2xl', { hasText: 'Kostas Fartlek' })
  await expect(familyCard.getByText('2 versions')).toBeVisible()

  // Schedule's browse picker searches this run's own library regardless of the
  // scheduled week's workout type — Kostas Fartlek is a TigerWolves-owned
  // workout, so the new variant is visible there too, not just in the Library
  // (the other half of the addWorkout/addVariation split-brain). Post-#401 the
  // picker is run_group-scoped, and this workout is in the run's own group.
  await page.goto('/schedule?week=0')
  await page.waitForLoadState('load')
  const browseTab = page.getByRole('button', { name: 'Change workout', exact: true })
  if (await browseTab.isVisible()) await browseTab.click()
  await page.locator('input[type="search"]').fill('Kostas Fartlek')
  await expect(page.getByText('ADDED VARIATION — 4x(5min tempo/5min MP)')).toBeVisible()
})

test('Flag round trip: leader reviews a reported issue and saves a fix, clearing the flag (#277 — variant_id write path)', async ({ page }) => {
  await page.goto('/library')
  await page.waitForLoadState('load')

  await page.getByRole('button', { name: 'Issue reported — view details' }).click()
  await expect(page.getByRole('heading', { name: 'Review & fix' })).toBeVisible()
  await expect(page.getByText("We've been running 6x800m lately")).toBeVisible()

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

  // #412: adopt is same-type only, so the target is MMER's "MMER Threshold Session"
  // (a Quality route the TigerWolves Workout leader CAN adopt) — not its off-type
  // "McCarren Easy Loop", which is borrow-only (see schedule.spec.ts).
  // Baseline: it's NOT in TigerWolves' "Your run" library.
  await expect(page.getByText('MMER Threshold Session')).toHaveCount(0)

  // Find it under "All runs" and adopt it into our run.
  await page.getByRole('button', { name: 'All runs', exact: true }).click()
  const allRunsCard = page.locator('.bg-white.rounded-2xl', { hasText: 'MMER Threshold Session' })
  await expect(allRunsCard).toBeVisible()
  await allRunsCard.getByRole('button', { name: '+ Add to my run' }).click()
  // After adopting, the add affordance is gone for that card (it's now in the library).
  await expect(allRunsCard.getByRole('button', { name: '+ Add to my run' })).toHaveCount(0)

  // Switch to "Your run": the adopted route now shows, marked with its creator.
  await page.getByRole('button', { name: 'Your run', exact: true }).click()
  const yourRunCard = page.locator('.bg-white.rounded-2xl', { hasText: 'MMER Threshold Session' })
  await expect(yourRunCard).toBeVisible()
  await expect(yourRunCard.getByText(/adopted from MMER/)).toBeVisible()

  // Remove from my run (un-adopt) — it drops back out of "Your run".
  await yourRunCard.getByRole('button', { name: 'Remove from my run' }).click()
  await expect(page.getByText('MMER Threshold Session')).toHaveCount(0)
})
