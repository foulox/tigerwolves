import { test, expect } from '@playwright/test'

test.describe('Run Settings', () => {
  // storageState defaults to e2e/.auth/user.json via playwright.config.ts project config
  // The seeded test leader has the 'leader' role set in Clerk publicMetadata.

  test('Run Settings + Edit Workouts appear in the leader UserButton menu', async ({ page }) => {
    // #342: leader menu items moved from LeaderMenu button to UserButton
    await page.goto('/runs/tuesday-morning-tigerwolves')
    await page.waitForLoadState('load')
    // Run Settings + Edit Workouts live in the UserButton menu. Clerk's
    // UserButton.Link items are NOT exposed as role="menuitem" (the popover isn't
    // a strict ARIA menu), so match by accessible name across the roles Clerk may
    // render them as — link/button/menuitem — rather than assuming one. getByRole
    // with a name matches exactly one element per role, avoiding strict-mode churn.
    await page.locator('.cl-userButtonTrigger').click()
    const menuItem = (name: RegExp) =>
      page
        .getByRole('menuitem', { name })
        .or(page.getByRole('link', { name }))
        .or(page.getByRole('button', { name }))
    await expect(menuItem(/run settings/i)).toBeVisible()
    await expect(menuItem(/edit workouts/i)).toBeVisible()
    // Verify the old Leader menu button is gone
    await page.locator('.cl-userButtonTrigger').click()  // close the menu
    await expect(page.getByRole('button', { name: 'Leader menu' })).toHaveCount(0)
  })

  test('post template edits save and persist across reload', async ({ page }) => {
    await page.goto('/run-config')
    await page.waitForLoadState('load')

    // Run Settings opens on the "About the run" tab (#321); the template editor
    // lives under the "Post template" tab — the #382 chip/token contenteditable
    // editor, not the old per-field form — so switch to it first.
    await page.getByRole('button', { name: 'Post template' }).click()

    const editor = page.getByRole('textbox', { name: 'Post template editor' })
    await expect(editor).not.toBeEmpty() // seeded from the saved template on mount

    // Capture the original markup so we can restore it exactly at the end. The
    // schedule specs render this run's real saved template and run after this
    // one (serial, single worker), so a leftover sentinel would corrupt them.
    const originalHtml = await editor.evaluate(el => el.innerHTML)

    const sentinel = 'SENTINEL_PERSIST_CHECK'
    await editor.click()
    await page.keyboard.type(` ${sentinel}`)

    await page.getByRole('button', { name: /^save template$/i }).click()
    await expect(page.getByRole('button', { name: /saved!/i })).toBeVisible()

    // Reload lands back on the About tab — switch to Post template again and
    // confirm the edit survived the round-trip to the DB.
    await page.reload()
    await page.waitForLoadState('load')
    await page.getByRole('button', { name: 'Post template' }).click()
    await expect(page.getByRole('textbox', { name: 'Post template editor' })).toContainText(sentinel)

    // Restore the original template exactly. handleSave reads the live DOM
    // (readTokens walks the editor's child nodes), so setting innerHTML back is
    // enough; the input event also resyncs React state and clears the "Saved!"
    // flag so the button label returns to "Save template".
    const restored = page.getByRole('textbox', { name: 'Post template editor' })
    await restored.evaluate((el, html) => {
      el.innerHTML = html
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, originalHtml)
    await page.getByRole('button', { name: /^save template$/i }).click()
    await expect(page.getByRole('button', { name: /saved!/i })).toBeVisible()
  })

  test('tab switch preserves unsaved post-template edit (mounted-but-hidden)', async ({ page }) => {
    await page.goto('/run-config')
    await page.waitForLoadState('load')

    // Switch to Post template tab. The editor is mounted-but-hidden when inactive
    // (#382 / #505 contract): switching away and back must not discard unsaved edits.
    await page.getByRole('button', { name: 'Post template' }).click()

    const editor = page.getByRole('textbox', { name: 'Post template editor' })
    await expect(editor).not.toBeEmpty()

    // Capture original HTML for restore at the end (mirrors lines 44 / 64–70 of
    // the persist test above — same discipline, same reason: later schedule specs
    // run serial on this same run and will render the template from the DB).
    const originalHtml = await editor.evaluate(el => el.innerHTML)

    const sentinel = 'TABSWITCH_KEEP'
    await editor.click()
    await page.keyboard.type(` ${sentinel}`)

    // Switch away to Roster without saving, then come back.
    await page.getByRole('button', { name: 'Roster' }).click()
    await page.getByRole('button', { name: 'Post template' }).click()

    // The sentinel must still be present — the editor DOM was hidden, not unmounted.
    await expect(editor).toContainText(sentinel)

    // Restore the original HTML and save so the DB returns to its seeded state.
    // (The typed sentinel was never saved to the DB, but if a prior run left drift,
    // this save normalises it.)
    await editor.evaluate((el, html) => {
      el.innerHTML = html
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, originalHtml)
    await page.getByRole('button', { name: /^save template$/i }).click()
    await expect(page.getByRole('button', { name: /saved!/i })).toBeVisible()
  })

  test('roster rotation reorder round-trips (reversible)', async ({ page }) => {
    await page.goto('/run-config')
    await page.waitForLoadState('load')

    await page.getByRole('button', { name: 'Roster' }).click()

    // Each leader row has "Remove {name}" buttons — use them to read roster order
    // by accessible name without relying on any Tailwind class.
    const removeButtons = page.getByRole('button', { name: /^Remove / })
    const count = await removeButtons.count()

    if (count < 2) {
      // Defensive guard: fewer than 2 leaders means reorder is meaningless.
      // Document the skip so it's visible in CI output, then exit cleanly.
      console.log('Roster reorder test skipped — fewer than 2 leaders in seed data')
      return
    }

    // Edge contract: "Move up" on the first leader and "Move down" on the last
    // must be disabled (no out-of-bounds reorder allowed).
    const moveUpButtons = page.getByRole('button', { name: 'Move up' })
    const moveDownButtons = page.getByRole('button', { name: 'Move down' })
    await expect(moveUpButtons.first()).toBeDisabled()
    await expect(moveDownButtons.last()).toBeDisabled()

    // Read initial name order from the Remove-button aria-labels.
    const namesBefore = await removeButtons.evaluateAll(els =>
      els.map(el => el.getAttribute('aria-label')?.replace(/^Remove /, '') ?? '')
    )

    // Move the first leader down (swaps leaders 1 ↔ 2 and persists via saveRotationOrder).
    await moveDownButtons.first().click()

    // Wait for the optimistic update to settle — the button state flips immediately
    // because React applies the local swap synchronously before the server round-trip.
    // We need to wait for the new DOM order to reflect the swap.
    await expect(removeButtons.first()).not.toHaveAttribute('aria-label', `Remove ${namesBefore[0]}`)

    const namesAfter = await removeButtons.evaluateAll(els =>
      els.map(el => el.getAttribute('aria-label')?.replace(/^Remove /, '') ?? '')
    )

    // The first two leaders should have swapped; the rest should be unchanged.
    expect(namesAfter[0]).toBe(namesBefore[1])
    expect(namesAfter[1]).toBe(namesBefore[0])
    expect(namesAfter.slice(2)).toEqual(namesBefore.slice(2))

    // Swap back by moving the current first leader down again, restoring seeded order.
    await moveDownButtons.first().click()
    await expect(removeButtons.first()).toHaveAttribute('aria-label', `Remove ${namesBefore[0]}`)

    const namesRestored = await removeButtons.evaluateAll(els =>
      els.map(el => el.getAttribute('aria-label')?.replace(/^Remove /, '') ?? '')
    )
    expect(namesRestored).toEqual(namesBefore)
  })

  test('away period save shows confirmation banner', async ({ page }) => {
    await page.goto('/run-config')
    await page.waitForLoadState('load')

    // Switch to the Roster tab
    await page.getByRole('button', { name: 'Roster' }).click()

    // Open the away panel for the first leader in the list
    await page.getByRole('button', { name: /away/i }).first().click()

    // exact match: getByLabel does substring matching by default, so a loose "To"
    // could pick up an unrelated control whose label merely contains it.
    await page.getByLabel('From', { exact: true }).fill('2099-01-01')
    await page.getByLabel('To', { exact: true }).fill('2099-01-07')
    await page.getByRole('button', { name: /save away period/i }).click()

    await expect(page.getByText(/away period saved/i)).toBeVisible()
  })
})
