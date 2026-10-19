import { test, expect, type Page } from '@playwright/test'

// Browse interactive contract — locked BEFORE the NBR Story-4 reskin (#514) and
// kept green through it. Presentation changes (square corners, monochrome, Jost
// labels); every behavior below must survive unchanged. BEHAVIOR ONLY — roles,
// text, handlers, navigation — never visual classes (epic #510 Testing rule).
//
// Auth: default storageState is the TigerWolves test-leader (playwright.config.ts),
// so leader-only affordances (Mark as verified) are present.
//
// Fixture safety: workers:1 + fullyParallel:false run specs serially in file order;
// this file (b…) runs before library (l…) and races (r…). The Races half mutates
// ONLY a self-added race (unique name) — never the two seeded fixtures — so those
// specs' assertions stay valid. Adding a race never touches the workouts table.

const NEW_RACE = 'Reskin Contract Marathon'

test.describe('Library browse contract (#514)', () => {
  test('search filters the list; clearing restores it', async ({ page }) => {
    await page.goto('/library')
    await page.waitForLoadState('load')

    // A seeded TigerWolves workout whose name never collides with a type pill.
    const target = page.getByText('The Moneghetti')
    const other = page.getByText('Ladder - 1 to 5 to 1')
    await expect(target).toBeVisible()
    await expect(other).toBeVisible()

    const search = page.locator('input[type="search"]')
    await search.fill('Moneghetti')
    await expect(target).toBeVisible()       // match stays
    await expect(other).toHaveCount(0)       // non-match filtered out

    await search.fill('')                    // clear restores the full list
    await expect(page.getByText('Ladder - 1 to 5 to 1')).toBeVisible()
  })

  test('sort toggle switches the ordering label', async ({ page }) => {
    await page.goto('/library')
    await page.waitForLoadState('load')

    // The sort is now a dropdown ("Change sort order"); the count line echoes the
    // active sort, so the label is a reliable behavioral proof that the onClick
    // survived the reskin. (Race-type/type chips are the same filterChip + onClick
    // swap as the category chips, which library.spec.ts locks; seeded workouts carry
    // no race tags, so a race-type filter can't be asserted here.)
    await expect(page.getByText(/workouts · oldest first/)).toBeVisible()
    await page.getByRole('button', { name: 'Change sort order' }).click()
    await page.getByRole('menuitem', { name: 'Top rated', exact: true }).click()
    await expect(page.getByText(/workouts · top rated/)).toBeVisible()
    await page.getByRole('button', { name: 'Change sort order' }).click()
    await page.getByRole('menuitem', { name: 'Least recent', exact: true }).click()
    await expect(page.getByText(/workouts · oldest first/)).toBeVisible()
  })
})

test.describe('Races browse contract (#514)', () => {
  async function addRace(page: Page) {
    await page.goto('/races')
    await page.waitForLoadState('load')
    await page.getByRole('button', { name: 'Add a race' }).click()
    await expect(page.getByRole('heading', { name: 'Add a race' })).toBeVisible()
    await page.getByPlaceholder('e.g. NYC Marathon').fill(NEW_RACE)
    // Date input: 60 days out (any valid future date; format YYYY-MM-DD).
    await page.locator('input[type="date"]').first().fill('2027-01-01')
    await page.getByRole('button', { name: 'Add race', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Add a race' })).not.toBeVisible()
  }

  test('Add a race: opens the sheet, submits, the new card appears', async ({ page }) => {
    await addRace(page)
    const card = page.locator(`[data-testid="race-card-${NEW_RACE}"]`)
    await expect(card).toBeVisible()
    await expect(card.getByText('Unverified')).toBeVisible()
  })

  test('priority tag: tagging Target reflects in the tally', async ({ page }) => {
    const card = page.locator(`[data-testid="race-card-${NEW_RACE}"]`)
    await page.goto('/races')
    await page.waitForLoadState('load')
    // (Race persists from the previous test in this serial file.) Tag Target.
    const targetChip = card.getByRole('button', { name: /Target/ })
    await expect(targetChip).toBeVisible()
    await targetChip.click()
    await expect(card.getByRole('button', { name: /Target · 1/ })).toBeVisible()
  })

  test('leader Mark as verified flips Unverified → Verified', async ({ page }) => {
    const card = page.locator(`[data-testid="race-card-${NEW_RACE}"]`)
    await page.goto('/races')
    await page.waitForLoadState('load')
    await expect(card.getByText('Unverified')).toBeVisible()
    await card.getByRole('button', { name: 'Mark as verified' }).click()
    await expect(card.getByText('Verified', { exact: true })).toBeVisible()
  })

  test('Flag an issue opens the flag sheet', async ({ page }) => {
    const card = page.locator(`[data-testid="race-card-${NEW_RACE}"]`)
    await page.goto('/races')
    await page.waitForLoadState('load')
    await card.getByRole('button', { name: 'Flag an issue' }).click()
    await expect(page.getByRole('heading', { name: 'Flag an issue' })).toBeVisible()
  })
})
