/**
 * Generate turn-by-turn route directions for the Saturday Narwhals library and
 * store them on each route's workout_families.route_narrative, marking the route
 * `flagged` for leader review (auto-generated directions are not leader-confirmed).
 *
 * Reuses the app's real directions pipeline (lib/routeDirections → Mapbox
 * map-match + landmarks + Claude Sonnet narrative). The only substitution is the
 * GPS-trace fetch: the app's Strava path caches its token in Vercel KV, which
 * isn't available to a script, so we refresh a Strava access token directly from
 * STRAVA_CLIENT_ID/SECRET/REFRESH_TOKEN and inject a custom fetchFullTrace.
 *
 * OnTheGoMap routes are skipped (unsupported provider — no trace to match).
 *
 * Idempotent: re-running regenerates and overwrites. Writes to whatever
 * DATABASE_URL points at (prints host, requires --yes). Raw SQL does not flush
 * the Next.js cache — pass REVALIDATE_URL to flush, or let the 5-min TTL expire.
 *
 * Required env: DATABASE_URL, MAPBOX_TOKEN, ANTHROPIC_API_KEY,
 *               STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN.
 *
 * Usage:
 *   export MAPBOX_TOKEN=... ANTHROPIC_API_KEY=...   # e.g. via `op read`
 *   node --env-file=.env.local --import tsx scripts/generate-narwhals-directions.ts --yes
 */
import { neon } from '@neondatabase/serverless'
import { generateNarrative } from '@/lib/routeDirections'
import type { LatLng } from '@/lib/routeDirections/types'
import { parseStravaRouteId } from '@/lib/routeProviders/strava'
import { parseMapMyRunRouteId, fetchMapMyRunLatLng } from '@/lib/routeProviders/mapmyrun'
import { NARWHALS_ROUTES, NARWHALS_RUN_ID } from './fixtures/narwhals'

const FLAG_NOTE = 'Auto-generated route directions (Claude) — leader to review and confirm.'

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return '(unparseable DATABASE_URL)'
  }
}

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set`)
  return v
}

async function freshStravaToken(): Promise<string> {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: requireEnv('STRAVA_CLIENT_ID'),
      client_secret: requireEnv('STRAVA_CLIENT_SECRET'),
      grant_type: 'refresh_token',
      refresh_token: requireEnv('STRAVA_REFRESH_TOKEN'),
    }),
  })
  if (!res.ok) throw new Error(`Strava token refresh failed: ${res.status} ${res.statusText}`)
  const data = (await res.json()) as { access_token: string }
  return data.access_token
}

/** Trace fetcher matching lib/routeProviders, but with a directly-refreshed Strava token. */
function makeFetchTrace(stravaToken: string): (url: string) => Promise<LatLng[]> {
  return async (url: string): Promise<LatLng[]> => {
    const sid = parseStravaRouteId(url)
    if (sid) {
      const res = await fetch(`https://www.strava.com/api/v3/routes/${sid}/streams`, {
        headers: { Authorization: `Bearer ${stravaToken}` },
      })
      if (!res.ok) return []
      const streams = (await res.json()) as { type?: string; data?: [number, number][] }[]
      const latlng = Array.isArray(streams) ? streams.find(s => s.type === 'latlng')?.data : undefined
      return Array.isArray(latlng) ? latlng.map(([lat, lng]) => [lat, lng] as LatLng) : []
    }
    const mid = parseMapMyRunRouteId(url)
    if (mid) return fetchMapMyRunLatLng(mid)
    return [] // OnTheGoMap / unsupported
  }
}

async function main(): Promise<void> {
  const url = requireEnv('DATABASE_URL')
  requireEnv('MAPBOX_TOKEN')
  requireEnv('ANTHROPIC_API_KEY')
  const confirmed = process.argv.includes('--yes') || process.env.GENERATE_NARWHALS_YES === '1'
  const host = hostOf(url)

  const eligible = NARWHALS_ROUTES.filter(r => parseStravaRouteId(r.mapLink) || parseMapMyRunRouteId(r.mapLink))
  const skipped = NARWHALS_ROUTES.length - eligible.length

  if (!confirmed) {
    throw new Error(
      `generate-narwhals-directions.ts will generate turn-by-turn for ${eligible.length} ` +
        `routes (${skipped} OnTheGoMap skipped) and write route_narrative + review flags into ` +
        `run '${NARWHALS_RUN_ID}' on host:\n  ${host}\nRe-run with --yes to confirm.`,
    )
  }

  const sql = neon(url)
  const [run] = await sql`SELECT run_group_id FROM runs WHERE id = ${NARWHALS_RUN_ID}`
  if (!run?.run_group_id) throw new Error(`run '${NARWHALS_RUN_ID}' has no run_group_id — load the library first.`)
  const groupId = run.run_group_id as number

  console.log(`Generating directions for ${eligible.length} routes (${skipped} skipped) on ${host}...`)
  const stravaToken = await freshStravaToken()
  const fetchFullTrace = makeFetchTrace(stravaToken)

  let ok = 0
  const failed: string[] = []
  for (const route of eligible) {
    try {
      const narrative = await generateNarrative(
        { url: route.mapLink, routeName: route.name, distanceMiles: route.distMiles },
        { fetchFullTrace },
      )
      if (!narrative) {
        failed.push(route.name)
        console.log(`  ✗ ${route.name} — no narrative (empty trace or match)`)
        continue
      }
      await sql`
        UPDATE workout_families SET route_narrative = ${narrative}
        WHERE run_group_id = ${groupId} AND name = ${route.name}
      `
      await sql`
        UPDATE workout_variants SET flagged = true, flag_note = ${FLAG_NOTE}
        WHERE label IS NULL AND family_id = (
          SELECT id FROM workout_families WHERE run_group_id = ${groupId} AND name = ${route.name}
        )
      `
      ok++
      console.log(`  ✓ ${route.name} (${narrative.length} chars)`)
    } catch (err) {
      failed.push(route.name)
      console.log(`  ✗ ${route.name} — ${(err as Error).message}`)
    }
  }

  console.log(`\nDone: ${ok} generated, ${failed.length} failed, ${skipped} skipped (OnTheGoMap).`)
  if (failed.length) console.log(`Failed: ${failed.join(', ')}`)

  const revalidateUrl = process.env.REVALIDATE_URL
  if (revalidateUrl) {
    const endpoint = `${revalidateUrl.replace(/\/$/, '')}/api/e2e-revalidate`
    const res = await fetch(endpoint, { method: 'POST' })
    console.log(res.ok ? `✓ Cache invalidated` : `Cache revalidation failed: ${res.status}`)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
