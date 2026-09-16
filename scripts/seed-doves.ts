/**
 * Seed the durable Mourning Doves Long/route run into the database named by
 * DATABASE_URL — intended for a per-PR Preview Neon branch (a fork of
 * production) so #382's route-run preview and #387's route-post path have a real
 * Long run to exercise on that Preview URL.
 *
 * Usage:
 *   DATABASE_URL=<preview-branch-connection-string> npx tsx scripts/seed-doves.ts --yes
 *
 * (Fetch a Preview branch's connection string via the Neon REST API — see
 * CLAUDE.md "Tooling Notes"; project purple-star-02119717.)
 *
 * The fixture is additive and fixture-scoped: it only ever deletes rows with
 * run_id 'doves' (a run id that exists nowhere but this fixture), reuses an
 * existing "Mourning Doves" run_group rather than clobbering it, and never wipes
 * a table — so it is safe against a production-forked Preview branch. Because it
 * still writes to whatever DATABASE_URL points at, it refuses to run without an
 * explicit --yes (or SEED_DOVES_YES=1) and prints the target host first, so
 * production is never seeded by accident.
 */
import { neon } from '@neondatabase/serverless'
import { seedDovesLongRun } from './fixtures/dovesLongRun'

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

  const confirmed = process.argv.includes('--yes') || process.env.SEED_DOVES_YES === '1'
  const host = hostOf(url)
  if (!confirmed) {
    throw new Error(
      `seed-doves.ts will write the 'doves' Long-run fixture to host:\n  ${host}\n` +
        `Re-run with --yes (or SEED_DOVES_YES=1) to confirm this is the branch you intend ` +
        `— e.g. a per-PR Preview branch, NOT production.`,
    )
  }

  console.log(`Seeding Mourning Doves Long/route run into ${host}...`)
  const sql = neon(url)
  await seedDovesLongRun(sql)
  console.log('✓ Done. run_id "doves" (kind Long) now has two route workouts + a 2-Wednesday schedule.')
  console.log('  Add a leader to run_id "doves" (via the app, or set clerk_user_id) to open it as a leader.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
