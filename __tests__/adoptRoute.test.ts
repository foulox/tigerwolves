import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest'

// #404: adopt/un-adopt routes into a run's library (run_workouts membership).
// currentUser() is Clerk server context (mocked); updateTag() throws outside a Server
// Action (stubbed, real next/cache otherwise so lib/db's unstable_cache still imports).
// The DB is real staging — the write tests provision their own group/runs/family and
// clean up, so they never touch shared fixtures.
vi.mock('@clerk/nextjs/server', () => ({ currentUser: vi.fn(), clerkClient: vi.fn() }))
vi.mock('next/cache', async importOriginal => {
  const actual = await importOriginal<typeof import('next/cache')>()
  // adoptRoute/unadoptRoute call revalidateAll() = revalidatePath + updateTag; BOTH
  // throw outside a real request scope, so both must be stubbed (unlike followActions,
  // which only calls updateTag). Leaving revalidatePath real made the happy-path adopt
  // throw into its own try/catch and return an error — the CI-only failure on staging.
  return { ...actual, updateTag: vi.fn(), revalidatePath: vi.fn() }
})
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))

import { currentUser } from '@clerk/nextjs/server'
import { sql, getRunLibraryFamilyIds, dbAdoptRoute, dbUnadoptRoute, leaderLeadsRun, dbRegroupVariants } from '../lib/db'
import { adoptRoute, unadoptRoute } from '../app/actions'

const STAGING_HOST = 'ep-fragrant-sunset-atmdps9n-pooler.c-9.us-east-1.aws.neon.tech'
const onStaging = (process.env.DATABASE_URL ?? '').includes(STAGING_HOST)

function signInAs(clerkId: string | null, role: 'leader' | null = 'leader') {
  vi.mocked(currentUser).mockResolvedValue(
    clerkId ? ({ id: clerkId, publicMetadata: role ? { role } : {} } as never) : (null as never),
  )
}

// The auth guard short-circuits before any DB access, so these run without staging.
describe('adoptRoute / unadoptRoute authorization (no DB)', () => {
  test('signed-out callers are Unauthorized', async () => {
    signInAs(null)
    expect((await adoptRoute('any-run', 1)).error).toBe('Unauthorized')
    expect((await unadoptRoute('any-run', 1)).error).toBe('Unauthorized')
  })

  test('a signed-in NON-leader is Unauthorized', async () => {
    signInAs('user_runner_404', null)
    expect((await adoptRoute('any-run', 1)).error).toBe('Unauthorized')
    expect((await unadoptRoute('any-run', 1)).error).toBe('Unauthorized')
  })
})

describe.skipIf(!onStaging)('run_workouts junction schema (AC1)', () => {
  test('exists with a (run_id, family_id) primary key and FKs to runs + workout_families', async () => {
    const cols = (await sql`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'run_workouts'
    `).map(r => r.column_name as string)
    expect(cols).toContain('run_id')
    expect(cols).toContain('family_id')

    const pk = (await sql`
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
      WHERE tc.table_name = 'run_workouts' AND tc.constraint_type = 'PRIMARY KEY'
    `).map(r => r.column_name as string).sort()
    expect(pk).toEqual(['family_id', 'run_id'])

    const fkTargets = (await sql`
      SELECT ccu.table_name AS target
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.table_name = 'run_workouts' AND tc.constraint_type = 'FOREIGN KEY'
    `).map(r => r.target as string).sort()
    expect(fkTargets).toEqual(['runs', 'workout_families'])
  })
})

describe.skipIf(!onStaging)('adopt / un-adopt membership (staging, AC2/AC4/AC8/AC9)', () => {
  const GROUP = 'Adopt Test 404'
  const RUN_A = 'test-adopt-404-a' // led by LEADER
  const RUN_B = 'test-adopt-404-b' // NOT led by LEADER
  const LEADER = 'user_adopt_leader_404'
  let groupId: number
  let familyId: number

  beforeAll(async () => {
    // A run_group + a route (family) it created. SELECT-then-INSERT rather than
    // ON CONFLICT (name): the E2E-wipe staging branch may not carry the UNIQUE(name)
    // constraint, so ON CONFLICT (name) would throw "no unique or exclusion constraint
    // matching the ON CONFLICT specification" there (same reason seed-e2e.ts avoids it).
    const existingGroup = await sql`SELECT id FROM run_groups WHERE name = ${GROUP}`
    groupId = existingGroup.length > 0
      ? (existingGroup[0].id as number)
      : ((await sql`
          INSERT INTO run_groups (name, venue, default_location) VALUES (${GROUP}, 'road', 'Test')
          RETURNING id
        `)[0].id as number)
    const [f] = await sql`
      INSERT INTO workout_families (name, category, type, reason, author, run_group_id)
      VALUES ('Adopt Fixture Route', 'Long', 'Long', 'test', ${GROUP}, ${groupId})
      RETURNING id
    `
    familyId = f.id as number
    await sql`
      INSERT INTO workout_variants (family_id, label, sort_order, raw_input, has_turnaround, turnaround, flagged, flag_note)
      VALUES (${familyId}, NULL, NULL, 'test route', false, '', false, '')
    `
    // Two runs; LEADER actively leads RUN_A only.
    await sql`INSERT INTO runs (id, name) VALUES (${RUN_A}, 'Adopt Run A') ON CONFLICT (id) DO NOTHING`
    await sql`INSERT INTO runs (id, name) VALUES (${RUN_B}, 'Adopt Run B') ON CONFLICT (id) DO NOTHING`
    await sql`DELETE FROM run_leaders WHERE clerk_user_id = ${LEADER}`
    await sql`INSERT INTO run_leaders (run_id, name, clerk_user_id, sort_order, active) VALUES (${RUN_A}, 'Adopt Leader', ${LEADER}, 1, true)`
    await sql`DELETE FROM run_workouts WHERE run_id IN (${RUN_A}, ${RUN_B})`
  })

  afterAll(async () => {
    await sql`DELETE FROM run_workouts WHERE run_id IN (${RUN_A}, ${RUN_B})`
    await sql`DELETE FROM run_leaders WHERE clerk_user_id = ${LEADER}`
    await sql`DELETE FROM workout_variants WHERE family_id = ${familyId}`
    await sql`DELETE FROM workout_families WHERE id = ${familyId}`
    await sql`DELETE FROM runs WHERE id IN (${RUN_A}, ${RUN_B})`
    await sql`DELETE FROM run_groups WHERE id = ${groupId}`
  })

  test('leaderLeadsRun reflects the roster', async () => {
    expect(await leaderLeadsRun(LEADER, RUN_A)).toBe(true)
    expect(await leaderLeadsRun(LEADER, RUN_B)).toBe(false)
  })

  test('a leader adopts a route into their run, then un-adopts it (membership toggles)', async () => {
    signInAs(LEADER)

    expect(await getRunLibraryFamilyIds(RUN_A)).not.toContain(familyId)

    const adopt = await adoptRoute(RUN_A, familyId)
    expect(adopt.error).toBeUndefined()
    expect(await getRunLibraryFamilyIds(RUN_A)).toContain(familyId)

    // Idempotent — adopting again is a no-op, not a duplicate/error.
    expect((await adoptRoute(RUN_A, familyId)).error).toBeUndefined()
    const rows = await sql`SELECT 1 FROM run_workouts WHERE run_id = ${RUN_A} AND family_id = ${familyId}`
    expect(rows.length).toBe(1)

    const unadopt = await unadoptRoute(RUN_A, familyId)
    expect(unadopt.error).toBeUndefined()
    expect(await getRunLibraryFamilyIds(RUN_A)).not.toContain(familyId)
  })

  test('a leader CANNOT adopt into a run they do not lead (AC8) — no row written', async () => {
    signInAs(LEADER)
    const res = await adoptRoute(RUN_B, familyId)
    expect(res.error).toMatch(/only add routes to a run you lead/)
    const rows = await sql`SELECT 1 FROM run_workouts WHERE run_id = ${RUN_B} AND family_id = ${familyId}`
    expect(rows.length).toBe(0)
  })

  test('editing the one route definition propagates to every run using it (AC9)', async () => {
    // RUN_A owns it (membership), RUN_B adopts the SAME family — two adopters, one row.
    await dbAdoptRoute(RUN_A, familyId)
    await dbAdoptRoute(RUN_B, familyId)
    expect(await getRunLibraryFamilyIds(RUN_A)).toContain(familyId)
    expect(await getRunLibraryFamilyIds(RUN_B)).toContain(familyId)

    // A global edit touches the single workout_families row (the edit primitive is
    // tested in db.test.ts; here we assert the propagation property — one definition,
    // seen by all adopters).
    await sql`UPDATE workout_families SET name = 'Adopt Fixture Route (edited)' WHERE id = ${familyId}`
    const [fam] = await sql`SELECT name FROM workout_families WHERE id = ${familyId}`
    expect(fam.name).toBe('Adopt Fixture Route (edited)')

    // Both runs still reference the same (now-edited) family — the fix reached both.
    expect(await getRunLibraryFamilyIds(RUN_A)).toContain(familyId)
    expect(await getRunLibraryFamilyIds(RUN_B)).toContain(familyId)

    await dbUnadoptRoute(RUN_A, familyId)
    await dbUnadoptRoute(RUN_B, familyId)
  })

  test('un-adopt is per-run: removing from an adopter never drops the creator’s copy', async () => {
    await dbAdoptRoute(RUN_A, familyId) // creator/owner membership
    await dbAdoptRoute(RUN_B, familyId) // adopter membership
    await dbUnadoptRoute(RUN_B, familyId)
    expect(await getRunLibraryFamilyIds(RUN_B)).not.toContain(familyId)
    expect(await getRunLibraryFamilyIds(RUN_A)).toContain(familyId)
    // The canonical route still exists — un-adopt is not a delete.
    const [fam] = await sql`SELECT 1 FROM workout_families WHERE id = ${familyId}`
    expect(fam).toBeTruthy()
    await dbUnadoptRoute(RUN_A, familyId)
  })
})

describe.skipIf(!onStaging)('regroup inherits library membership (#404 review)', () => {
  // Regressions the CI e2e caught: dbRegroupVariants creates a NEW family, and under
  // the membership model that family had no run_workouts row → the merged workout
  // vanished from every run's "Your run." It must inherit membership from its sources.
  const RUN = 'test-regroup-404'
  let groupId: number
  let famA: number, famB: number, vA: number, vB: number

  beforeAll(async () => {
    const existing = await sql`SELECT id FROM run_groups WHERE name = ${'Regroup Test 404'}`
    groupId = existing.length > 0
      ? (existing[0].id as number)
      : ((await sql`INSERT INTO run_groups (name, venue, default_location) VALUES ('Regroup Test 404','road','t') RETURNING id`)[0].id as number)
    await sql`INSERT INTO runs (id, name) VALUES (${RUN}, 'Regroup Run') ON CONFLICT (id) DO NOTHING`
    const [a] = await sql`INSERT INTO workout_families (name, category, type, reason, author, run_group_id) VALUES ('Regroup A','Quality','Interval','t','t',${groupId}) RETURNING id`
    const [b] = await sql`INSERT INTO workout_families (name, category, type, reason, author, run_group_id) VALUES ('Regroup B','Quality','Interval','t','t',${groupId}) RETURNING id`
    famA = a.id as number; famB = b.id as number
    vA = (await sql`INSERT INTO workout_variants (family_id, label, sort_order, raw_input, has_turnaround, turnaround, flagged, flag_note) VALUES (${famA}, NULL, NULL, 'a', false, '', false, '') RETURNING id`)[0].id as number
    vB = (await sql`INSERT INTO workout_variants (family_id, label, sort_order, raw_input, has_turnaround, turnaround, flagged, flag_note) VALUES (${famB}, NULL, NULL, 'b', false, '', false, '') RETURNING id`)[0].id as number
    // RUN's library holds both source families.
    await dbAdoptRoute(RUN, famA)
    await dbAdoptRoute(RUN, famB)
  })

  afterAll(async () => {
    await sql`DELETE FROM run_workouts WHERE run_id = ${RUN}`
    await sql`DELETE FROM workout_variants WHERE family_id IN (${famA}, ${famB})`
    await sql`DELETE FROM workout_families WHERE run_group_id = ${groupId}`
    await sql`DELETE FROM runs WHERE id = ${RUN}`
    await sql`DELETE FROM run_groups WHERE id = ${groupId}`
  })

  test('the merged family lands in the run’s library (membership inherited from sources)', async () => {
    await dbRegroupVariants('Regroup Merged 404', [
      { variantId: vA, label: 'Short', sortOrder: 1 },
      { variantId: vB, label: 'Long', sortOrder: 2 },
    ])
    const [merged] = await sql`SELECT id FROM workout_families WHERE name = 'Regroup Merged 404'`
    expect(merged).toBeTruthy()
    const mergedId = merged.id as number
    // The new family is in RUN's library; the emptied source families are gone.
    expect(await getRunLibraryFamilyIds(RUN)).toContain(mergedId)
    const srcRows = await sql`SELECT 1 FROM workout_families WHERE id IN (${famA}, ${famB})`
    expect(srcRows.length).toBe(0)
    // cleanup the merged family + its membership (afterAll's group delete also catches it)
    await sql`DELETE FROM run_workouts WHERE family_id = ${mergedId}`
    await sql`DELETE FROM workout_variants WHERE family_id = ${mergedId}`
    await sql`DELETE FROM workout_families WHERE id = ${mergedId}`
  })
})
