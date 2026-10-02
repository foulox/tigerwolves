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
  // Route-based = any workout with a map_link whose run is not a Workout run.
  const rows = await sql`
    SELECT f.id, f.name, f.map_link, f.distance_miles
    FROM workout_families f
    WHERE f.map_link IS NOT NULL
      AND f.run_group_id IN (SELECT run_group_id FROM runs WHERE kind <> 'Workout' AND run_group_id IS NOT NULL)
  ` as any[]
  let ok = 0, none = 0
  for (const r of rows) {
    const n = await generateNarrative({ url: r.map_link, routeName: r.name, distanceMiles: r.distance_miles })
    await sql`UPDATE workout_families SET route_narrative = ${n} WHERE id = ${r.id}`
    if (n) ok++; else none++
    console.log(`${n ? '✓' : '∅'} ${r.name}${n ? ` (${n.length}ch)` : ' — no narrative'}`)
  }
  console.log(`Done: ${rows.length} routes (${ok} narrated, ${none} unmatched).`)
}
main().catch(e => { console.error('ERR', e.message); process.exit(1) })
