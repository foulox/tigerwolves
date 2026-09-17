import { test, expect } from '@playwright/test'

test('Schedule page for the already-planned week shows the Heylo post with fixture content', async ({ page }) => {
  await page.goto('/schedule?week=0')
  await page.waitForLoadState('load')

  await expect(page.getByRole('button', { name: 'Post draft', exact: true })).toBeVisible()
  const post = page.getByRole('textbox', { name: 'Editable weekly post' })
  await expect(post).toHaveValue(/Yasso 800s/)
  await expect(post).toHaveValue(/10x800m @ 5K effort/)
  await expect(page.getByRole('button', { name: /copy to clipboard/i })).toBeVisible()
})

test('Schedule page for the unplanned week lets a leader pick a fixture workout and generates its Heylo post', async ({ page }) => {
  await page.goto('/schedule?week=2')
  await page.waitForLoadState('load')

  // No workout planned yet for this week — the picker shows directly, no tabs.
  await expect(page.getByRole('button', { name: 'Post draft', exact: true })).toHaveCount(0)

  await page.locator('button').filter({ hasText: 'Fort Greene Hills' }).first().click()

  const post = page.getByRole('textbox', { name: 'Editable weekly post' })
  await expect(post).toHaveValue(/Fort Greene Hills/)
  await expect(post).toHaveValue(/8x90sec hill repeats/)
})

test('generated post is editable inline with an "editable" cue and no Edit button', async ({ page }) => {
  await page.goto('/schedule?week=0')
  await page.waitForLoadState('load')

  const post = page.getByRole('textbox', { name: 'Editable weekly post' })
  await expect(post).toBeEditable()
  await expect(page.getByText('✎ editable')).toBeVisible()
  // The post is editable immediately — there is no Edit control to press.
  await expect(page.getByRole('button', { name: /^edit$/i })).toHaveCount(0)
})

test('regenerating the post discards inline edits', async ({ page }) => {
  await page.goto('/schedule?week=0')
  await page.waitForLoadState('load')

  const post = page.getByRole('textbox', { name: 'Editable weekly post' })
  await post.fill('SENTINEL EDIT — should not survive regenerate')
  await expect(post).toHaveValue(/SENTINEL EDIT/)

  // Advancing a week and returning recomputes the post in place (no reload),
  // which the reset-on-regenerate effect uses to clear the ephemeral edit.
  // Target the chevrons by aria-label — a positional icon-button selector drifts
  // when other icon-only buttons (e.g. the header's Feedback button) are present.
  await page.getByRole('button', { name: 'Next week' }).click()
  await expect(page.getByRole('textbox', { name: 'Editable weekly post' })).not.toHaveValue(/SENTINEL EDIT/)

  await page.getByRole('button', { name: 'Previous week' }).click() // back to week 0

  const postAgain = page.getByRole('textbox', { name: 'Editable weekly post' })
  await expect(postAgain).not.toHaveValue(/SENTINEL EDIT/)
  await expect(postAgain).toHaveValue(/Yasso 800s/)
})

test('the edited text is what gets copied to the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/schedule?week=0')
  await page.waitForLoadState('load')

  const post = page.getByRole('textbox', { name: 'Editable weekly post' })
  await post.fill('EDITED POST BODY — copy me')

  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: /copy to clipboard/i }).click()

  const clipboard = await page.evaluate(() => navigator.clipboard.readText())
  expect(clipboard).toContain('EDITED POST BODY — copy me')
})

test('verification checkbox is required before copy', async ({ page }) => {
  await page.goto('/schedule?week=0')
  await page.waitForLoadState('load')

  // Planned week shows Post draft tab with copy button — must be disabled before checkbox
  const copyBtn = page.getByRole('button', { name: /copy to clipboard/i })
  await expect(copyBtn).toBeDisabled()

  const checkbox = page.getByRole('checkbox')
  await checkbox.check()
  await expect(copyBtn).toBeEnabled()
})

test('TigerWolves post contains correct branding', async ({ page }) => {
  await page.goto('/schedule?week=0')
  await page.waitForLoadState('load')

  const post = await page.getByRole('textbox', { name: 'Editable weekly post' }).inputValue()
  expect(post).toContain('TigerWolves')
  expect(post).not.toContain('undefined')
  expect(post).not.toContain('null')
})

test('Schedule page tab switch: Post draft is default, Change workout reveals the picker, and switching back preserves the post', async ({ page }) => {
  await page.goto('/schedule?week=0')
  await page.waitForLoadState('load')

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
  await expect(page.getByRole('textbox', { name: 'Editable weekly post' })).toHaveValue(/Yasso 800s/)
})

test.describe('redirect: /plan → /schedule', () => {
  test('GET /plan?week=0 lands on /schedule?week=0', async ({ page }) => {
    await page.goto('/plan?week=0')
    await page.waitForURL(/\/schedule/)
    expect(page.url()).toContain('/schedule')
    expect(page.url()).toContain('week=0')
  })
})
