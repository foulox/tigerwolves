import type { NeonQueryFunction } from '@neondatabase/serverless'

// A Neon tagged-template SQL client (what `neon(url)` returns — default
// non-array, non-full-results mode), so the fixture is portable across seed
// scripts and its query results are plain row arrays.
type Sql = NeonQueryFunction<false, false>

// ─────────────────────────────────────────────────────────────────────────────
// Saturday Narwhals route library — loaded from the club's "Narwhals Route List"
// Google Sheet (29 named routes; full set pulled via CSV export, not the Drive
// reader's truncated sample).
//
// Narwhals is a Saturday marathon-training long-run group, so every route is a
// category/type = Long family with a single variant carrying its distance + map
// link. Modeled on scripts/fixtures/mourningDoves.ts.
//
// Deliberate load decisions (confirmed with Lou):
//  - The nameless sheet row (an OnTheGoMap blob, no route name) is excluded.
//  - Two duplicate-link pairs share one map ID, so one link in each pair is wrong
//    in the sheet. The later-listed route of each pair is HELD until a leader
//    fixes its link — "Red Hook Valentino Park" (dup of West Side Highway, Strava
//    3010320972659106728) and "Manhattan 20" (dup of Central Park + Rock Center,
//    MapMyRun 1892979527). Net: 27 routes loaded.
//  - OnTheGoMap is not a supported turn-by-turn provider, so the 5 OnTheGoMap
//    routes load as map-link-only (no generated directions). The other 22 are
//    Strava/MapMyRun and are turn-by-turn eligible (generated separately).
//  - No run-history dates exist in the Route List tab, so last_ran is null for all.
//
// Minor source normalizations (noted for transparency):
//  - Strava/MapMyRun links canonicalized (tracking query stripped from the Jackie
//    O link; http→https on Randall's Island). OnTheGoMap links kept verbatim.
//  - Typo fix in one description: "West Hide Highway" → "West Side Highway".
//  - "Queensboro -> Williamsburg" rendered with a → arrow.
// ─────────────────────────────────────────────────────────────────────────────

export interface NarwhalsRoute {
  name: string
  /** Short route description from the sheet; null when the sheet left it blank. */
  description: string | null
  distMiles: number
  mapLink: string
}

const strava = (id: string) => `https://www.strava.com/routes/${id}`
const mapmyrun = (id: string) => `https://www.mapmyrun.com/routes/view/${id}/`

// One OnTheGoMap route is shared as a full inline-polyline URL (no short /s/ form
// in the sheet). Kept verbatim — it is the only link we have for this route.
const ONTHEGOMAP_CP_FINISH =
  'https://onthegomap.com/?m=r&u=mi&w%5B%5D=Routes+may+not+be+suitable+for+public+use.&c%5B%5D=Route+data+%C2%A92024+On+The+Go+Map%2C+OpenStreetMap+Contributors&d=32985&f=69ff0e61f3&n=1&dm=1&context=share&r2=cfnu7znhZE8j10f15n1Ff1Rd1FFRLAT2TFDHR3115h3l315x9nABF31Z3j375x2f3l3p331DHn3r3x2b3d3h3HP31j2n25912h2n2PNt2r1DBp8j5Z7j4JJ29f4l26FPBR5M4o1l4Gf44V1ErDr2B3f4Pf1Gl2y2rBWDZ3o38GHOz2c3JI04FM32l2y2JGb1Dl2y2f3q3j3W498b3m3RMl6i1505f16g1t3MlE_2vCm214F4B211~8w104P413ZCi204F4B211b8o114304023k17u6f122C1G303aCh224Q303W9v122C1G323wCl2mEz2_3Lm6h1SLc3l3A7k3~3g3p3m2x2c1EKFm2x241GL03KH_2b3IN20w2X305KH_2f3ONi2v241UZ1e3l369Y3h3KHI5E1UAY1641_6k1W5W1y3O23G8C084O6k4u2_3o2KAg1Sq6Y466A4W7m4q2u2ECu2Y3a1Y1CCa3m3IGc3m3Tq1Up1e3i3IMq2w2C6IKu2c3A8a3k3AA86o3y3u2Y3oAaBA8W5q5i5w5C5EE6G838U42618Q82q1u1KU_8Z5iAx543s5d3OBy3f2e8j3A0E3k1mF4Q19W1Ju1Lc5ToAt1m3HW6l1STo25WDZ2_13o18aSi9A0E5IJIUO4O0k2OA41Cw2jE_3g1C6iDk4UCu6c2I8e4u3IId2oB3a1v2gEx2mEZ1a60O749m1h1c716LUY5WEB8c2W66Ce3e97685Iu146IDOBW1LSVC7W2Ru1r3c1r288_1d4i2r5q2x5h2g59B273NEh1yLdo1mLdn1aAtNa1v1e5ZCAHA02Al1_3DKVi20c188C6a1Su1c1c4e3m7g5q4i3qBs8u2y1i8a6c2m1s5c4MEe4c3s3q2_3_2MEk6w4a1Os3u2e5u3e3k2g4Y3o7q5w5a4w2a2c4W3y6a5i1UyAY8W4u2c8Y6g4Y3MIo2w1W1Qs6y4MEW4W3i3i2c5y3kAo7SOo1Y1u6y4Y7e5q4g3q4m3e3g2E8a4Y3s3q2q2W2k5_3MEi2w1c7e5y1g1m3q2a1Oc4a3W3a2u6W5W3Y2g2s1O7ACm2u1w1s1Uc1W1m1W2w3iAmKc1q1c1i1c1Y1a1Q27UM2182e5hC24SM62ALa7c5ECYCw833APe2b5u1f4Sn1KN36KEc4w2s1QW6e4g2t5p6n4PNb2v2DLq1Z2IRW3X4s2j38Dm1f1Md1W2h4Ud26Ju1v38d16z8AX6Aj1u2t60PNPB9p7p5APv3x2z6~4h4d3THh3f213FBl3h2559Kn3n2LHb3d2d4b3z3v299~7v5A8k4rAB5lFfB7325x1e4n2e695X4t2Z1Rt2z1z3z2b3d2LHz4n3l8f6v1d1p4l3f5t36J77n6v4b3f21423pK~EnJhEf4Z3F7X4X3z3v2x3z2d3f2b8X63ACX1B94FzDdAZ1Z1Nh1BX15T1r1Kf44j15n19l1HZ2Lr1Nl1LTPR~2f2f1Pz2n1X2j1b2Z2d2~2f1l1f1X1x2z1X2Z1z4t1z2h1R3f2ER3J9NHJTl1j3n1l2LNz2r2PDr15X163Ph19B5Be1DKNML8d10T5j2X13I~1Z1n1f1Td1x2t5f1p1VPj2f1b1PTNRVb1X2FZ1Bf1Fh1Vf1d1Vj3d1t2Jb34z1Ev1Kj1Qf1Uf1Mf14n1Jb2n1~1d10LT7JJt1j1AFk6fFAJc7XHy5XEG21625M0K3O9SVCe1o1m2EW1k1g2Ge12Me1Es1W1o1g1e3g3q2c3q1e2e2o3W1e1k1k1c1Sg2i1a2Q'

// 27 routes, in sheet order (ascending mileage). Red Hook Valentino Park and
// Manhattan 20 are intentionally absent (held — duplicate links).
export const NARWHALS_ROUTES: NarwhalsRoute[] = [
  { name: 'Day of the Dead', description: "Route to Ofrenda at St. Mark's Church", distMiles: 10, mapLink: 'https://onthegomap.com/s/r1sqtq19' },
  { name: 'Highland Park Run', description: 'Run to Highland Park loop', distMiles: 10.98, mapLink: strava('6893486') },
  { name: 'Prospect Park Loop', description: 'Very classic PP Loop route', distMiles: 12.46, mapLink: mapmyrun('1442696815') },
  { name: 'Roosevelt Island Loop', description: null, distMiles: 12.47, mapLink: mapmyrun('1537475563') },
  { name: 'Central Park + Rock Center', description: 'Run to see the tree at rock center with a CP mini loop', distMiles: 13.56, mapLink: mapmyrun('1892979527') },
  { name: 'Queensboro → Williamsburg', description: 'Over Queensboro to west side, home over WB', distMiles: 13.91, mapLink: strava('3086494767554404642') },
  { name: 'West Side Highway + Battery Park', description: 'Out and back to West Side Highway via Battery Park', distMiles: 14.06, mapLink: strava('3010320972659106728') },
  { name: 'NBR Two Bridges + Statue of Liberty Photoshoot', description: 'Two Bridges and Battery Park', distMiles: 14.6, mapLink: strava('3374946164151710464') },
  { name: 'Three bridges', description: 'Lots of Queens industrial wasteland with this one', distMiles: 15.34, mapLink: mapmyrun('6669374880') },
  { name: 'Sunset Park Run', description: 'Routes around PP and Greenwood', distMiles: 15.57, mapLink: mapmyrun('1560538828') },
  { name: 'Seneca village Juneteenth', description: 'QBB to Jackie O reservoir to Seneca village and back 1st Ave to WBB', distMiles: 16.1, mapLink: strava('3502660537213270986') },
  { name: 'Three Bridges Run', description: 'Out and backs on Brooklyn, Manhattan, and Williamsburg bridges', distMiles: 16.12, mapLink: mapmyrun('990256791') },
  { name: "Randall's Island", description: "Up to Randall's Island, down east side, home on WB", distMiles: 16.48, mapLink: mapmyrun('628223246') },
  { name: 'Brooklyn Bridge Park, Ikea, Prospect Park', description: null, distMiles: 16.74, mapLink: mapmyrun('1427240707') },
  { name: 'Brooklyn Piers + Prospect Park', description: 'Around all of the piers, loop of PP, end at Brooklyn Roasting Co', distMiles: 17.69, mapLink: 'https://onthegomap.com/s/05oig2j5' },
  { name: 'Jackie O & The West Side', description: 'Over Queensboro, up to reservoir, down west side highway, home on WB', distMiles: 17.81, mapLink: strava('3134864487838893632') },
  { name: 'Central Park + East River', description: 'Over Queensboro, around whole park, down via east river to WB', distMiles: 18.16, mapLink: mapmyrun('1420115725') },
  { name: 'High Line Run', description: 'High Line via Battery Park', distMiles: 18.34, mapLink: mapmyrun('1710849518') },
  { name: 'NBR | General Grant National Memorial', description: 'Nice mix up in routes to do Riverside Park', distMiles: 19.2, mapLink: strava('3398121726075879042') },
  { name: 'Fast and Flat', description: 'Good training for Chicago or Berlin marathoners', distMiles: 19.5, mapLink: mapmyrun('6767815033') },
  { name: 'Last Part of the Marathon out and Back', description: 'Route of the last part of the marathon but out and back over Queensboro', distMiles: 19.63, mapLink: 'https://onthegomap.com/s/qbr8r2t3' },
  { name: 'Miles 2-12 of the Marathon', description: 'Route of miles 2-12 of the marathon out and back', distMiles: 19.91, mapLink: strava('3276015254141545768') },
  { name: 'Astoria Park / Roosevelt Island', description: '14 or 20 mile route to Astoria Park and Roosevelt Island', distMiles: 20.02, mapLink: 'https://onthegomap.com/s/advvn1g0' },
  { name: "Taeya's 20 miler", description: 'Prospect park and Greenwood loops', distMiles: 20.09, mapLink: strava('7720978') },
  { name: 'Last Part of the Marathon (end in Central Park)', description: 'Route of the last part of the marathon and end in CP', distMiles: 20.5, mapLink: ONTHEGOMAP_CP_FINISH },
  { name: 'NBR | NYCM Second Half Preview (Return to McCarren Park)', description: 'Good route during peak NYCM training period', distMiles: 21.3, mapLink: strava('3405335107508655154') },
  { name: 'Finale to the NYC Half', description: 'Manhattan Bridge to West Side Highway to Central Park, home over Queensboro', distMiles: 22, mapLink: mapmyrun('6431597122') },
]

export const NARWHALS_RUN_ID = 'saturday-narwhals'
export const NARWHALS_GROUP = 'Saturday Narwhals'

/**
 * Load the Saturday Narwhals route library into the database named by
 * DATABASE_URL. Idempotent and additive (never wipes a table; converges on
 * re-run). Also claims the run: if it is still `unclaimed`, this creates its
 * content-owning run_group and flips it to `draft` — mirroring the app's
 * setUpRun admin action (app/admin/actions.ts). Never downgrades a run that is
 * already draft/live.
 *
 * Raw SQL does NOT invalidate the Next.js data cache — pass REVALIDATE_URL to the
 * calling script to flush it after loading.
 */
export async function seedNarwhals(
  sql: Sql,
  opts: { runId?: string; groupName?: string } = {},
): Promise<{ loaded: number; status: string; runGroupId: number }> {
  const runId = opts.runId ?? NARWHALS_RUN_ID

  const [run] = await sql`SELECT name, meeting_location, status, run_group_id FROM runs WHERE id = ${runId}`
  if (!run) {
    throw new Error(
      `run '${runId}' does not exist. Expected the Saturday Narwhals directory row ` +
        `(seeded in scripts/migrate-446.sql). Did you point at the wrong database?`,
    )
  }

  // Resolve (or create) the content-owning run_group, matching resolveOrCreateRunGroup.
  const groupName = opts.groupName ?? (run.name as string) ?? NARWHALS_GROUP
  let groupId = run.run_group_id as number | null
  if (groupId == null) {
    const existingGroup = await sql`SELECT id FROM run_groups WHERE name = ${groupName}`
    groupId =
      existingGroup.length > 0
        ? (existingGroup[0].id as number)
        : ((
            await sql`
              INSERT INTO run_groups (name, venue, default_location)
              VALUES (${groupName}, 'road', ${(run.meeting_location as string | null) ?? null})
              RETURNING id
            `
          )[0].id as number)
  }

  // Claim the stub: unclaimed → draft + run_group_id. Never downgrade a
  // draft/live run; only ever flip an unclaimed one (same guard as setUpRun).
  let status = run.status as string
  if (status === 'unclaimed') {
    await sql`UPDATE runs SET status = 'draft', run_group_id = ${groupId} WHERE id = ${runId}`
    status = 'draft'
  } else if (run.run_group_id == null) {
    await sql`UPDATE runs SET run_group_id = ${groupId} WHERE id = ${runId}`
  }

  for (const route of NARWHALS_ROUTES) {
    const existingFamily = await sql`
      SELECT id FROM workout_families WHERE run_group_id = ${groupId} AND name = ${route.name}
    `
    const familyId =
      existingFamily.length > 0
        ? (existingFamily[0].id as number)
        : ((
            await sql`
              INSERT INTO workout_families (name, category, type, run_group_id, map_link)
              VALUES (${route.name}, 'Long', 'Long', ${groupId}, ${route.mapLink})
              RETURNING id
            `
          )[0].id as number)

    if (existingFamily.length > 0) {
      await sql`
        UPDATE workout_families
        SET category = 'Long', type = 'Long', map_link = ${route.mapLink}
        WHERE id = ${familyId}
      `
    }

    // One variant per route (label NULL). The description rides in raw_input (the
    // card "description" block); dist_time carries mileage.
    const distTime = `${route.distMiles} miles`
    const rawInput = route.description ?? ''
    const existingVariant = await sql`
      SELECT id FROM workout_variants WHERE family_id = ${familyId} AND label IS NULL
    `
    if (existingVariant.length === 0) {
      await sql`
        INSERT INTO workout_variants (family_id, label, sort_order, raw_input, dist_time, map_link, has_turnaround, turnaround, flagged, flag_note)
        VALUES (${familyId}, NULL, NULL, ${rawInput}, ${distTime}, ${route.mapLink}, false, '', false, '')
      `
    } else {
      await sql`
        UPDATE workout_variants
        SET raw_input = ${rawInput}, dist_time = ${distTime}, map_link = ${route.mapLink}
        WHERE id = ${existingVariant[0].id as number}
      `
    }

    // Library membership for this run; no run-history dates in the source sheet.
    await sql`
      INSERT INTO run_workouts (run_id, family_id, last_ran)
      VALUES (${runId}, ${familyId}, NULL)
      ON CONFLICT (run_id, family_id) DO NOTHING
    `
  }

  return { loaded: NARWHALS_ROUTES.length, status, runGroupId: groupId }
}
