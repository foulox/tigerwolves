import { test as setup } from '@playwright/test'
import { clerk } from '@clerk/testing/playwright'
import { neon } from '@neondatabase/serverless'
import fs from 'fs'
import path from 'path'

const authFile = path.join(__dirname, '.auth/user.json')

setup('authenticate as test leader', async ({ page }) => {
  // #332: '/' is now a thin router (getFollowedRunIds + redirect), no longer the
  // schedule page. Post-sign-in it redirects a fresh leader (0 follows) onward to
  // /all-runs — a stable authenticated surface to save storage state from. 90s
  // still gives CI room without letting a genuine hang hide.
  setup.setTimeout(90000)

  const email = process.env.PLAYWRIGHT_TEST_EMAIL
  if (!email) throw new Error('PLAYWRIGHT_TEST_EMAIL must be set in .env.test')

  // Signs in via a Backend-API-minted ticket instead of password + Device Trust.
  // Device Trust only gates *password* sign-ins, and @clerk/testing's password
  // strategy doesn't check signIn.create()'s status before calling setActive() —
  // when Device Trust requires extra verification, createdSessionId comes back
  // undefined and setActive() silently no-ops, so no error surfaces but no
  // session cookie is ever set either. Ticket-based sign-in (clerk.signIn with
  // emailAddress) uses CLERK_SECRET_KEY to mint a sign-in ticket directly via
  // the Backend API and redeems it client-side — no password, no Device Trust
  // check. See #273.
  await page.goto('/')
  await clerk.signIn({ page, emailAddress: email })

  // clerk.signIn() navigates to /?__clerk_ticket=… then Clerk JS redeems it and
  // redirects to '/', which now server-redirects onward to /all-runs. Wait for
  // that natural redirect chain to settle — do NOT issue a competing page.goto()
  // here, which races the ongoing redirect and produces net::ERR_ABORTED ("maybe
  // frame was detached") in CI. The ticket param is gone once redemption lands.
  await page.waitForURL(url => !url.searchParams.has('__clerk_ticket'), { timeout: 60000 })

  // Wait for the landing page to finish rendering before saving state.
  await page.waitForLoadState('load', { timeout: 60000 })

  // Link the seeded roster to THIS signed-in account's real Clerk user id.
  // getLeaderRun() (and therefore the whole /run-config surface) only recognizes a
  // leader whose run_leaders row carries their exact clerk_user_id. The login is the
  // source of truth: seed-e2e.ts leaves clerk_user_id NULL, and we read the id straight
  // from the live session here and stamp it onto the first roster row (Dana Kim). So
  // whatever account actually signs in becomes the linked leader — no hand-maintained
  // id secret to drift, and it survives the test account being recreated with a fresh
  // id. getLeaderRun/getRunRoster are uncached, so this UPDATE is visible to the very
  // next request with no cache invalidation.
  const clerkUserId = await page
    .waitForFunction(() => (window as unknown as { Clerk?: { user?: { id?: string } } }).Clerk?.user?.id, null, { timeout: 30000 })
    .then(handle => handle.jsonValue() as Promise<string>)
    .catch(() => null)

  const dbUrl = process.env.DATABASE_URL
  if (clerkUserId && dbUrl) {
    const sql = neon(dbUrl)
    await sql`
      UPDATE run_leaders
      SET clerk_user_id = ${clerkUserId}
      WHERE run_id = 'tigerwolves' AND name = 'Dana Kim'
    `
  } else if (!clerkUserId) {
    throw new Error('auth.setup: could not read window.Clerk.user.id after sign-in — cannot link the test leader, /run-config specs would redirect. Failing setup loudly rather than leaving an unlinked roster.')
  }

  fs.mkdirSync(path.dirname(authFile), { recursive: true })
  await page.context().storageState({ path: authFile })
})
