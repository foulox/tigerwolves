// scripts/backfill-distance-miles.ts — one-off backfill of workout_families.distance_miles
// for legacy routes that have a map_link but no numeric distance (e.g. the Long/Doves
// routes created before the #457/#458 enrich pipeline). Resolves distance from the route
// link via the SAME providers the live /api/route/enrich uses (Strava, MapMyRun), so the
// numbers match what a fresh import would produce. Distance only — elevation/geometry/
// image are a separate, optional re-enrich.
//
// Strava resolution needs STRAVA_* creds (in .env.local) AND KV creds for the token cache
// (NOT in .env.local) — pass KV_REST_API_URL + KV_REST_API_TOKEN inline from .env.test:
//   KV_REST_API_URL=... KV_REST_API_TOKEN=... npx tsx scripts/backfill-distance-miles.ts --env=prod
// Dry run by default (no writes); add --apply to write. Host-guarded.
import { config } from 'dotenv'
config({ path: '.env.local' })
import { sql } from '../lib/db'
import { providerFor } from '../lib/routeProviders/registry'

const EXPECTED: Record<string, string> = { prod: 'ep-super-waterfall', demo: 'ep-ancient-math' }

async function main() {
  const env = process.argv.find((a) => a.startsWith('--env='))?.split('=')[1] ?? ''
  const apply = process.argv.includes('--apply')
  if (!EXPECTED[env]) throw new Error('pass --env=prod|demo (and --env must match DATABASE_URL)')
  // Host guard: DATABASE_URL must match the named env — unless --allow-any-host is given
  // for a one-off Preview-branch run (a transient Neon host the integration provisions).
  const host = new URL(process.env.DATABASE_URL ?? '').host
  if (!host.includes(EXPECTED[env]) && !process.argv.includes('--allow-any-host')) {
    throw new Error(`HOST GUARD: DATABASE_URL host ${host} does not match --env=${env} (${EXPECTED[env]}). Pass --allow-any-host for a Preview branch.`)
  }

  const families = (await sql`
    SELECT id, name, category, map_link
    FROM workout_families
    WHERE distance_miles IS NULL AND map_link IS NOT NULL AND map_link <> ''
    ORDER BY category, name
  `) as { id: number; name: string; category: string; map_link: string }[]

  const stats = { candidates: families.length, resolved: 0, noProvider: 0, noResult: 0, updated: 0 }
  const resolved: { category: string; name: string; provider: string; miles: string }[] = []
  const skipped: { category: string; name: string; reason: string; link: string }[] = []

  for (const f of families) {
    const provider = providerFor(f.map_link)
    if (!provider) { stats.noProvider++; skipped.push({ category: f.category, name: f.name, reason: 'no-provider', link: f.map_link }); continue }
    let result = null
    try { result = await provider.fetch(f.map_link) } catch (e) {
      skipped.push({ category: f.category, name: f.name, reason: `error: ${(e as Error).message}`, link: f.map_link }); stats.noResult++; continue
    }
    if (!result || result.distanceMiles == null) { stats.noResult++; skipped.push({ category: f.category, name: f.name, reason: `no-distance (${provider.id})`, link: f.map_link }); continue }
    stats.resolved++
    resolved.push({ category: f.category, name: f.name, provider: provider.id, miles: result.distanceMiles.toFixed(2) })
    if (apply) {
      await sql`UPDATE workout_families SET distance_miles = ${result.distanceMiles} WHERE id = ${f.id}`
      stats.updated++
    }
  }

  console.log('\n=== RESOLVED ===')
  console.table(resolved)
  if (skipped.length) { console.log('\n=== SKIPPED ==='); console.table(skipped) }
  console.log('\n', stats, apply ? '  <<< APPLIED (writes committed) >>>' : '  (DRY RUN — pass --apply to write)')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
