import { test as setup } from '@playwright/test'
import { clerk } from '@clerk/testing/playwright'
import { neon } from '@neondatabase/serverless'
import fs from 'fs'
import path from 'path'

const authFile = path.join(__dirname, '.auth/user.json')

setup('authenticate as test leader', async ({ page }) => {
  // CI renders '/' slowly (several sequential DB calls). 30s is too tight;
  // 90s gives the server room to breathe without letting a genuine hang hide.
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
  // redirects to '/'. Wait for that natural redirect to land — do NOT issue a
  // competing page.goto('/') here, which races the ongoing redirect and produces
  // net::ERR_ABORTED ("maybe frame was detached") in CI.
  await page.waitForURL(url => !url.searchParams.has('__clerk_ticket'), { timeout: 60000 })

  // Wait for the page to finish rendering before saving state — in CI, '/' is
  // slow (generateScheduleHorizon makes several sequential DB calls).
  await page.waitForLoadState('load', { timeout: 60000 })

  // Link the seeded roster to THIS signed-in account's real Clerk user id.
  // getLeaderRun() (and therefore the whole /run-config surface) only recognizes a
  // leader whose run_leaders row carries their exact clerk_user_id. seed-e2e.ts seeds
  // that id from the PLAYWRIGHT_TEST_CLERK_USER_ID secret, but that secret is easy to
  // leave stale — and the leader account could be recreated with a fresh id. Reading
  // the id straight from the live session here makes the link self-healing: whatever
  // account actually signed in becomes the linked leader. No-ops the secret when they
  // already agree. getLeaderRun/getRunRoster are uncached, so this UPDATE is visible
  // to the very next request with no cache invalidation.
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
    const check = await sql`SELECT name, clerk_user_id FROM run_leaders WHERE run_id = 'tigerwolves' ORDER BY sort_order`
    const runsCheck = await sql`SELECT id FROM runs`
    // TEMP DIAGNOSTIC: throw so the values land in the captured setup-test failure output.
    throw new Error(`[dbg] clientClerkId=${clerkUserId} | envSecretId=${process.env.PLAYWRIGHT_TEST_CLERK_USER_ID} | roster=${JSON.stringify(check)} | runs=${JSON.stringify(runsCheck)}`)
  } else if (!clerkUserId) {
    console.warn('auth.setup: could not read window.Clerk.user.id — /run-config specs may redirect if the seeded clerk_user_id is stale.')
  }

  fs.mkdirSync(path.dirname(authFile), { recursive: true })
  await page.context().storageState({ path: authFile })
})
