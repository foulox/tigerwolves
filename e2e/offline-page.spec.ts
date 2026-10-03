import { test, expect } from '@playwright/test'

// #465 Story B — the branded fallback renders standalone (no network/data),
// makes clear it is THIS page that needs signal, and points at the pages that
// still work offline.
test('offline fallback page renders brand copy + cached-page links', async ({ page }) => {
  await page.goto('/offline')
  await expect(page.getByRole('heading', { name: /offline/i })).toBeVisible()
  await expect(page.getByText(/this page needs/i)).toBeVisible()
  await expect(page.getByRole('link', { name: /all runs/i }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: /library/i }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: /races/i }).first()).toBeVisible()
})
