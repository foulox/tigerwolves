// scripts/regen-route-narratives.ts — regenerate route_narrative for ALL route-based runs
import { config } from 'dotenv'
config({ path: '.env.local' })
import { sql } from '../lib/db'
import { generateNarrative } from '../lib/routeDirections'

const EXPECTED: Record<string, string> = { demo: 'ep-ancient-math', prod: 'ep-super-waterfall' }

async function main() {
  const env = (process.argv.find(a => a.startsWith('--env='))?.split('=')[1]) ?? ''
  if (!EXPECTED[env]) throw new Error('pass --env=demo|prod')
  if (!new URL(process.env.DATABASE_URL ?? '').host.includes(EXPECTED[env])) throw new Error('HOST GUARD: DATABASE_URL does not match --env')
  // Route-based = any workout with an effective map_link whose run is not a Workout run.
  // Uses the app's effective link: COALESCE(family.map_link, variant.map_link) — so families
  // whose link lives only on workout_variants (e.g. Mourning Doves, migrate-411) are included.
  // KNOWN LIMITATION: route_narrative is family-level (migrate-460), so families whose two
  // variants have genuinely different routes (#411) get a single narrative generated from the
  // preferred link. Fully distinct per-variant narratives would need a schema change (out of
  // scope for #480).
  const rows = await sql`
    SELECT f.id, f.name,
           COALESCE(f.map_link, v.map_link) AS map_link,
           f.distance_miles
    FROM workout_families f
    LEFT JOIN LATERAL (
      SELECT map_link FROM workout_variants
      WHERE family_id = f.id AND map_link IS NOT NULL
      ORDER BY id LIMIT 1
    ) v ON true
    WHERE COALESCE(f.map_link, v.map_link) IS NOT NULL
      AND f.run_group_id IN (SELECT run_group_id FROM runs WHERE kind <> 'Workout' AND run_group_id IS NOT NULL)
  ` as { id: number; name: string; map_link: string; distance_miles: string | null }[]
  // NOTE: Neon returns `numeric` columns as strings, so distance_miles arrives as a
  // string (or null) — coerce to a real number before handing it to generateNarrative,
  // whose prompt calls .toFixed() on it.
  let ok = 0, none = 0
  for (const r of rows) {
    const distanceMiles = r.distance_miles == null ? null : Number(r.distance_miles)
    const n = await generateNarrative({ url: r.map_link, routeName: r.name, distanceMiles })
    await sql`UPDATE workout_families SET route_narrative = ${n} WHERE id = ${r.id}`
    if (n) ok++; else none++
    console.log(`${n ? '✓' : '∅'} ${r.name}${n ? ` (${n.length}ch)` : ' — no narrative'}`)
  }
  console.log(`Done: ${rows.length} routes (${ok} narrated, ${none} unmatched).`)
}
main().catch(e => { console.error('ERR', e.message); process.exit(1) })
