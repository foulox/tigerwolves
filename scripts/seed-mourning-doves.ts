/**
 * Load the REAL Mourning Doves route library (#411) — 42 families / 48 variants,
 * owned by the "Mourning Doves" run_group, each with its map link, distance, and
 * family-level last-run date — plus the `mourning-doves` run and its run_workouts
 * membership + last_ran rows.
 *
 * Data lives in scripts/fixtures/mourningDoves.ts (spec:
 * scratch/doves-import-mapping.md, URLs from the source sheet).
 *
 * This writes REAL library data and is meant to run against production AND the
 * demo-data branch (and each PR's Preview + the E2E-wipe/staging branch during
 * the build) — see CLAUDE.md "A migration reaches FOUR branches". The seed is
 * idempotent and additive (never wipes a table; only writes rows for run
 * `mourning-doves` / group "Mourning Doves"), but because it targets production it
 * still refuses to run without --yes and prints the target host first.
 *
 * Raw SQL does NOT invalidate the Next.js data cache (CLAUDE.md guardrail). Pass
 * REVALIDATE_URL=<app-origin> to POST <origin>/api/e2e-revalidate after the load
 * (e.g. https://tigerwolves.foulox.me or https://demo.tigerwolves.foulox.me).
 *
 * Usage:
 *   DATABASE_URL=<connection-string> npx tsx scripts/seed-mourning-doves.ts --yes
 *   DATABASE_URL=<...> REVALIDATE_URL=https://demo.tigerwolves.foulox.me npx tsx scripts/seed-mourning-doves.ts --yes
 */
import { neon } from '@neondatabase/serverless'
import {
  seedMourningDoves,
  MOURNING_DOVES_FAMILIES,
  MOURNING_DOVES_RUN_ID,
  MOURNING_DOVES_GROUP,
} from './fixtures/mourningDoves'

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

  const confirmed = process.argv.includes('--yes') || process.env.SEED_MOURNING_DOVES_YES === '1'
  const host = hostOf(url)
  const variantCount = MOURNING_DOVES_FAMILIES.reduce((n, f) => n + f.variants.length, 0)

  if (!confirmed) {
    throw new Error(
      `seed-mourning-doves.ts will load the REAL Mourning Doves library ` +
        `(${MOURNING_DOVES_FAMILIES.length} families / ${variantCount} variants, run ` +
        `'${MOURNING_DOVES_RUN_ID}', group '${MOURNING_DOVES_GROUP}') into host:\n  ${host}\n` +
        `Re-run with --yes (or SEED_MOURNING_DOVES_YES=1) to confirm this is the branch you intend.`,
    )
  }

  console.log(
    `Seeding ${MOURNING_DOVES_FAMILIES.length} families / ${variantCount} variants ` +
      `for '${MOURNING_DOVES_RUN_ID}' into ${host}...`,
  )
  const sql = neon(url)
  await seedMourningDoves(sql)
  console.log(`✓ Loaded. run '${MOURNING_DOVES_RUN_ID}' now has its ${variantCount}-route library + last_ran.`)

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
