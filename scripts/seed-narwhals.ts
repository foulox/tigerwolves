/**
 * Load the Saturday Narwhals route library (27 routes) into the already-seeded
 * `saturday-narwhals` directory run, and claim it (unclaimed → draft) so it owns
 * a run_group. Data lives in scripts/fixtures/narwhals.ts (from the club's
 * "Narwhals Route List" sheet, full CSV export).
 *
 * This writes REAL library data and targets production (and demo-data). The seed
 * is idempotent and additive — it never wipes a table and only writes rows for
 * run `saturday-narwhals` / group "Saturday Narwhals" — but because it targets
 * production it refuses to run without --yes and prints the target host first.
 *
 * It only ever flips the run from `unclaimed` to `draft`; it never sets a run
 * live (that needs an active leader, added in-app) and never downgrades a
 * draft/live run.
 *
 * Raw SQL does NOT invalidate the Next.js data cache (CLAUDE.md guardrail). Pass
 * REVALIDATE_URL=<app-origin> to POST <origin>/api/e2e-revalidate after loading.
 *
 * Usage:
 *   DATABASE_URL=<connection-string> npx tsx scripts/seed-narwhals.ts --yes
 *   DATABASE_URL=<...> REVALIDATE_URL=https://nbr.foulox.me npx tsx scripts/seed-narwhals.ts --yes
 */
import { neon } from '@neondatabase/serverless'
import { seedNarwhals, NARWHALS_ROUTES, NARWHALS_RUN_ID } from './fixtures/narwhals'

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return '(unparseable DATABASE_URL)'
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')

  const confirmed = process.argv.includes('--yes') || process.env.SEED_NARWHALS_YES === '1'
  const host = hostOf(url)

  if (!confirmed) {
    throw new Error(
      `seed-narwhals.ts will load the REAL Saturday Narwhals library ` +
        `(${NARWHALS_ROUTES.length} routes) into run '${NARWHALS_RUN_ID}' and claim it ` +
        `(unclaimed → draft) on host:\n  ${host}\n` +
        `Re-run with --yes (or SEED_NARWHALS_YES=1) to confirm this is the branch you intend.`,
    )
  }

  console.log(`Loading ${NARWHALS_ROUTES.length} routes into '${NARWHALS_RUN_ID}' on ${host}...`)
  const sql = neon(url)
  const result = await seedNarwhals(sql)
  console.log(`✓ Loaded ${result.loaded} routes. run '${NARWHALS_RUN_ID}' status=${result.status}, run_group_id=${result.runGroupId}.`)

  const revalidateUrl = process.env.REVALIDATE_URL
  if (revalidateUrl) {
    const endpoint = `${revalidateUrl.replace(/\/$/, '')}/api/e2e-revalidate`
    console.log(`Flushing Next.js cache at ${endpoint}...`)
    const res = await fetch(endpoint, { method: 'POST' })
    if (!res.ok) {
      throw new Error(
        `Cache revalidation failed: ${res.status} ${res.statusText}. The data loaded, ` +
          `but the cache may be stale for up to 5 minutes.`,
      )
    }
    console.log('  ✓ Cache invalidated')
  } else {
    console.log('  (No REVALIDATE_URL set — raw SQL does NOT flush the app cache; the UI may be')
    console.log('   stale for up to 5 minutes. Re-run with REVALIDATE_URL, or hit /api/e2e-revalidate.)')
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
