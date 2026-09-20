import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest'

// Grant half of the co-leader promotion story (#350).
//
// `grantLeaderRole` is a shared helper in lib/runLeaders.ts; it is called by
// `addRunLeaderByEmail` (after the roster INSERT succeeds) to grant the new
// leader the Clerk 'leader' role without clobbering existing publicMetadata.
//
// This suite proves:
//   1. Non-leader caller is rejected with 'Unauthorized' (no DB, no grant).
//   2. Cross-run caller is rejected with 'Forbidden' (DB ownership check).
//   3. Unknown email returns the exact error string; updateUser is NOT called.
//   4. Happy path: roster row inserted; updateUser called with merged publicMetadata
//      preserving any existing admin: true.
//
// currentUser() / clerkClient() are Clerk server context (no session in vitest),
// so they're mocked. updateTag() is a Server-Action-only Next primitive that
// throws outside a request, so it's stubbed. DB-touching tests run only on
// test-data (same guard as activateNbrRun.test.ts / runConfigAuth.test.ts).

const { mockGetUserList, mockUpdateUser, mockGetUser } = vi.hoisted(() => ({
  mockGetUserList: vi.fn(),
  mockUpdateUser: vi.fn(),
  mockGetUser: vi.fn(),
}))

vi.mock('@clerk/nextjs/server', () => ({
  currentUser: vi.fn(),
  clerkClient: vi.fn().mockResolvedValue({
    users: {
      getUserList: mockGetUserList,
      updateUser: mockUpdateUser,
      getUser: mockGetUser,
    },
  }),
}))
// Preserve the real next/cache exports (lib/db.ts uses unstable_cache at import
// time) and only stub updateTag, which throws outside a Server Action request.
vi.mock('next/cache', async importOriginal => {
  const actual = await importOriginal<typeof import('next/cache')>()
  return { ...actual, updateTag: vi.fn() }
})
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

import { currentUser } from '@clerk/nextjs/server'
import { sql } from '../lib/db'
import { addRunLeaderByEmail, removeRunLeader } from '../app/run-config/actions'
import { leadsAnyActiveRun } from '../lib/db'

// Test-data-only DB tests gated with describe.skipIf(!onTestData). CI sets
// DATABASE_URL to the test-data branch; local dev has no DATABASE_URL and the
// module fails to load off-test-data (same documented behavior as activateNbrRun.test.ts).
const TEST_DATA_HOST = 'ep-fragrant-sunset-atmdps9n-pooler.c-9.us-east-1.aws.neon.tech'
const onTestData = (process.env.DATABASE_URL ?? '').includes(TEST_DATA_HOST)

/** Set currentUser mock to a user with the given publicMetadata. */
function signInAs(id: string, { role }: { role?: string } = {}) {
  vi.mocked(currentUser).mockResolvedValue({
    id,
    publicMetadata: { ...(role !== undefined ? { role } : {}) },
  } as never)
}

/**
 * Configure the clerkClient mock to simulate a resolved Clerk user.
 * publicMetadata is returned as-is so grantLeaderRole can spread it.
 */
function mockClerkUser(opts: {
  id?: string
  firstName?: string | null
  lastName?: string | null
  email?: string
  publicMetadata?: Record<string, unknown>
} = {}) {
  const email = opts.email ?? 'coleader@example.com'
  const user = {
    id: opts.id ?? 'clerk_coleader_test_350',
    firstName: opts.firstName ?? 'Co',
    lastName: opts.lastName ?? 'Leader',
    username: null,
    emailAddresses: [{ emailAddress: email }],
    publicMetadata: opts.publicMetadata ?? {},
  }
  mockGetUserList.mockResolvedValue({ data: [user] })
  mockUpdateUser.mockResolvedValue(undefined)
  return user
}

/** Configure the mock to return no Clerk user — simulates an unknown email. */
function mockClerkUserNotFound() {
  mockGetUserList.mockResolvedValue({ data: [] })
}

// ---------------------------------------------------------------------------
// AUTH — role gate fires before any DB call, runs everywhere.
// ---------------------------------------------------------------------------

describe('addRunLeaderByEmail authorization', () => {
  test('returns Unauthorized for a non-leader caller (role !== leader)', async () => {
    signInAs('user_coleader_member_350', { role: 'member' })
    const res = await addRunLeaderByEmail('tigerwolves', 'coleader@example.com')
    expect(res.error).toBe('Unauthorized')
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  test('returns Unauthorized for a caller with no role at all', async () => {
    signInAs('user_coleader_norole_350')
    const res = await addRunLeaderByEmail('tigerwolves', 'coleader@example.com')
    expect(res.error).toBe('Unauthorized')
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// TEST-DATA — real DB writes; skipped when DATABASE_URL is not the test-data branch.
// ---------------------------------------------------------------------------

describe.skipIf(!onTestData)('addRunLeaderByEmail grant path (test-data)', () => {
  // A dedicated run + owning leader row. We use 'tigerwolves' as the cross-run
  // target (it already exists on test-data). The caller leads their own separate run.
  const CALLER_RUN = 'test-grant-350'
  const CALLER_CLERK_ID = 'user_granttest_caller_350'
  const CALLER_NAME = 'GrantTest Caller 350'

  const COLEADER_EMAIL = 'coleader-grant-350@example.com'
  const COLEADER_CLERK_ID = 'clerk_coleader_grant_350'

  beforeAll(async () => {
    await sql`INSERT INTO runs (id, name) VALUES (${CALLER_RUN}, 'Grant Test Run 350') ON CONFLICT (id) DO NOTHING`
    await sql`DELETE FROM run_leaders WHERE run_id = ${CALLER_RUN}`
    await sql`
      INSERT INTO run_leaders (run_id, name, clerk_user_id, sort_order, active)
      VALUES (${CALLER_RUN}, ${CALLER_NAME}, ${CALLER_CLERK_ID}, 1, true)
    `
  })

  afterAll(async () => {
    await sql`DELETE FROM run_leaders WHERE run_id = ${CALLER_RUN}`
    await sql`DELETE FROM runs WHERE id = ${CALLER_RUN}`
  })

  test('cross-run: leader cannot add to a run they do not own → Forbidden; updateUser not called', async () => {
    signInAs(CALLER_CLERK_ID, { role: 'leader' })
    mockUpdateUser.mockClear()

    // CALLER_CLERK_ID leads CALLER_RUN, not 'tigerwolves'
    const res = await addRunLeaderByEmail('tigerwolves', COLEADER_EMAIL)
    expect(res.error).toBe('Forbidden')
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  test('unknown email → "No account found…" error; updateUser not called', async () => {
    signInAs(CALLER_CLERK_ID, { role: 'leader' })
    mockClerkUserNotFound()
    mockUpdateUser.mockClear()

    const res = await addRunLeaderByEmail(CALLER_RUN, 'nobody-350@example.com')
    expect(res.error).toBe(
      'No account found for that email — they need to sign in once before they can be added.'
    )
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  test('success: roster row inserted; updateUser called with merged publicMetadata preserving admin:true', async () => {
    signInAs(CALLER_CLERK_ID, { role: 'leader' })
    // Simulate a co-leader who already has admin:true in their publicMetadata
    mockClerkUser({
      id: COLEADER_CLERK_ID,
      email: COLEADER_EMAIL,
      firstName: 'Co',
      lastName: 'Leader',
      publicMetadata: { admin: true },
    })
    mockUpdateUser.mockClear()

    const res = await addRunLeaderByEmail(CALLER_RUN, COLEADER_EMAIL)
    expect(res.error).toBeUndefined()

    // Roster row must exist with correct fields
    const rows = await sql`
      SELECT clerk_user_id, email, active
      FROM run_leaders
      WHERE run_id = ${CALLER_RUN} AND clerk_user_id = ${COLEADER_CLERK_ID}
    `
    expect(rows).toHaveLength(1)
    expect(rows[0].clerk_user_id).toBe(COLEADER_CLERK_ID)
    expect(rows[0].email).toBe(COLEADER_EMAIL)
    expect(rows[0].active).toBe(true)

    // Clerk role grant must be called exactly once with merged publicMetadata
    expect(mockUpdateUser).toHaveBeenCalledOnce()
    const [calledUserId, calledArgs] = mockUpdateUser.mock.calls[0] as [
      string,
      { publicMetadata: Record<string, unknown> },
    ]
    expect(calledUserId).toBe(COLEADER_CLERK_ID)
    // Must preserve admin:true AND add role:'leader'
    expect(calledArgs.publicMetadata).toEqual({ admin: true, role: 'leader' })
  })
})

// ---------------------------------------------------------------------------
// EMAIL DEDUP (#385, AC3) — adding an existing leader by email updates, not dupes
// ---------------------------------------------------------------------------
// The roster now links/dedupes on (run_id, email), not name. Re-adding someone
// already a leader of the run — same email, but Clerk now resolves a different
// display name — must update the existing row, never insert a second.

describe.skipIf(!onTestData)('addRunLeaderByEmail dedupes on email (AC3, test-data)', () => {
  const CALLER_RUN = 'test-emaildedup-385'
  const CALLER_CLERK_ID = 'user_emaildedup_caller_385'
  const CALLER_NAME = 'EmailDedup Caller 385'

  const TARGET_EMAIL = 'dedup-target-385@example.com'
  const TARGET_CLERK_ID = 'clerk_dedup_target_385'
  const ORIGINAL_NAME = 'Foo Original'

  beforeAll(async () => {
    await sql`INSERT INTO runs (id, name) VALUES (${CALLER_RUN}, 'EmailDedup Test Run 385') ON CONFLICT (id) DO NOTHING`
    await sql`DELETE FROM run_leaders WHERE run_id = ${CALLER_RUN}`
    // Owning leader (the caller).
    await sql`
      INSERT INTO run_leaders (run_id, name, clerk_user_id, sort_order, active)
      VALUES (${CALLER_RUN}, ${CALLER_NAME}, ${CALLER_CLERK_ID}, 1, true)
    `
    // The target is ALREADY a leader of this run, stored under ORIGINAL_NAME.
    await sql`
      INSERT INTO run_leaders (run_id, name, email, clerk_user_id, sort_order, active)
      VALUES (${CALLER_RUN}, ${ORIGINAL_NAME}, ${TARGET_EMAIL}, ${TARGET_CLERK_ID}, 2, true)
    `
  })

  afterAll(async () => {
    await sql`DELETE FROM run_leaders WHERE run_id = ${CALLER_RUN}`
    await sql`DELETE FROM runs WHERE id = ${CALLER_RUN}`
  })

  test('re-adding an existing leader by email (Clerk now resolves a different name) updates the row — exactly one, name preserved', async () => {
    signInAs(CALLER_CLERK_ID, { role: 'leader' })
    // Same email, but Clerk now resolves a DIFFERENT display name.
    mockClerkUser({
      id: TARGET_CLERK_ID,
      email: TARGET_EMAIL,
      firstName: 'Bar',
      lastName: 'Different',
    })

    const res = await addRunLeaderByEmail(CALLER_RUN, TARGET_EMAIL)
    expect(res.error).toBeUndefined()

    const rows = await sql`
      SELECT name, active FROM run_leaders
      WHERE run_id = ${CALLER_RUN} AND email = ${TARGET_EMAIL}
    `
    // Exactly one row — no second inserted despite the new display name.
    expect(rows).toHaveLength(1)
    expect(rows[0].active).toBe(true)
    // name is set only on insert, so the original display name is preserved on conflict.
    expect(rows[0].name).toBe(ORIGINAL_NAME)
  })
})

// ---------------------------------------------------------------------------
// REVOKE — removeRunLeader conditional role revoke (#350)
// ---------------------------------------------------------------------------
// Revoke is conditional: removing a co-leader revokes publicMetadata.role ONLY
// if that person leads no other active run. If they still lead another run, the
// role is left intact (no updateUser call). admin: true (and any other keys)
// must always be preserved.

// ---------------------------------------------------------------------------
// REGRESSION #378 — removeRunLeader throws TypeError on Neon date strings
// ---------------------------------------------------------------------------
// Root cause: the reassignment loop inside removeRunLeader called
// `(row.date as Date).toISOString()` — a false cast. The Neon serverless
// driver returns SQL `date` columns as strings (e.g. "2026-09-15"), not Date
// objects, so `.toISOString` is undefined → TypeError → caught by the action's
// try/catch → the user sees "Failed to remove leader". Only fires when the
// leader has ≥1 upcoming assigned schedule week (the only time the loop runs).
// The fix: use the codebase's existing `toDateString()` helper from lib/db.ts,
// which handles both Date objects and strings safely.

describe.skipIf(!onTestData)('removeRunLeader reassigns upcoming week (regression #378)', () => {
  const CALLER_RUN = 'test-remove-378'
  const CALLER_CLERK_ID = 'user_remove378_caller'
  const CALLER_NAME = 'Remove378 Caller'

  const REMOVED_EMAIL = 'remove378-target@example.com'
  const REMOVED_CLERK_ID = 'clerk_remove378_target'
  const REMOVED_NAME = 'Remove378 Target'

  // A future date well beyond today so the schedule row stays in the
  // "upcoming" window regardless of when CI runs.
  const FUTURE_DATE = '2099-01-07'

  let removedLeaderId: number

  beforeAll(async () => {
    await sql`INSERT INTO runs (id, name, day_of_week) VALUES (${CALLER_RUN}, 'Remove378 Test Run', 'Tuesday') ON CONFLICT (id) DO NOTHING`
    await sql`DELETE FROM schedule WHERE run_id = ${CALLER_RUN}`
    await sql`DELETE FROM run_leaders WHERE run_id = ${CALLER_RUN}`

    // The caller (run owner) stays active throughout so the reassignment roster is non-empty.
    await sql`
      INSERT INTO run_leaders (run_id, name, clerk_user_id, sort_order, active)
      VALUES (${CALLER_RUN}, ${CALLER_NAME}, ${CALLER_CLERK_ID}, 1, true)
    `

    // The leader being removed — has a future schedule row assigned to them.
    const [row] = await sql`
      INSERT INTO run_leaders (run_id, name, email, clerk_user_id, sort_order, active)
      VALUES (${CALLER_RUN}, ${REMOVED_NAME}, ${REMOVED_EMAIL}, ${REMOVED_CLERK_ID}, 2, true)
      ON CONFLICT (run_id, email) WHERE email IS NOT NULL DO UPDATE SET active = true, clerk_user_id = ${REMOVED_CLERK_ID}
      RETURNING id
    `
    removedLeaderId = row.id as number

    // A future schedule row assigned to the removed leader — this is what
    // triggers the date-access loop. Without this row the bug is dormant.
    await sql`
      INSERT INTO schedule (date, run_id, workout_type, leader, needs_leader)
      VALUES (${FUTURE_DATE}::date, ${CALLER_RUN}, '', ${REMOVED_NAME}, false)
      ON CONFLICT (date, run_id) DO UPDATE SET leader = ${REMOVED_NAME}, needs_leader = false
    `
  })

  afterAll(async () => {
    await sql`DELETE FROM schedule WHERE run_id = ${CALLER_RUN}`
    await sql`DELETE FROM run_leaders WHERE run_id = ${CALLER_RUN}`
    await sql`DELETE FROM runs WHERE id = ${CALLER_RUN}`
  })

  test('removeRunLeader reassigns an upcoming week without throwing on a Neon string date (regression: #378 "Failed to remove leader")', async () => {
    signInAs(CALLER_CLERK_ID, { role: 'leader' })
    // getUser is called by revokeLeaderRoleIfOrphaned
    mockGetUser.mockResolvedValue({
      id: REMOVED_CLERK_ID,
      publicMetadata: { role: 'leader' },
    })
    mockUpdateUser.mockClear()

    const res = await removeRunLeader(removedLeaderId)

    // BEFORE the fix: row.date is a string, (row.date as Date).toISOString() is
    // undefined → TypeError → action catches it → res.error = 'Failed to remove leader'
    expect(res.error).toBeUndefined()

    // The reassignment loop must have run: the future week was either reassigned
    // to another leader or marked needs_leader. Either outcome proves the loop
    // completed without throwing.
    expect(res.reassignedCount + res.noLeaderDates.length).toBeGreaterThanOrEqual(1)

    // The leader row must be deactivated
    const leaderRows = await sql`SELECT active FROM run_leaders WHERE id = ${removedLeaderId}`
    expect(leaderRows[0].active).toBe(false)
  })
})

describe.skipIf(!onTestData)('removeRunLeader revoke path (test-data)', () => {
  // Two runs: CALLER_RUN (owned by the test caller), SECOND_RUN (the removed
  // leader's other run — used to prove the "still leads another" branch).
  const CALLER_RUN = 'test-revoke-350'
  const CALLER_CLERK_ID = 'user_revoketest_caller_350'
  const CALLER_NAME = 'RevokeTest Caller 350'

  const SECOND_RUN = 'test-revoke-second-350'

  const REMOVED_EMAIL = 'coleader-revoke-350@example.com'
  const REMOVED_CLERK_ID = 'clerk_coleader_revoke_350'
  const REMOVED_NAME = 'RevokeTest Coleader 350'

  let removedLeaderId: number

  beforeAll(async () => {
    // Caller's run
    await sql`INSERT INTO runs (id, name) VALUES (${CALLER_RUN}, 'Revoke Test Run 350') ON CONFLICT (id) DO NOTHING`
    await sql`DELETE FROM run_leaders WHERE run_id = ${CALLER_RUN}`
    await sql`
      INSERT INTO run_leaders (run_id, name, clerk_user_id, sort_order, active)
      VALUES (${CALLER_RUN}, ${CALLER_NAME}, ${CALLER_CLERK_ID}, 1, true)
    `
    // Second run (for the "still leads another" branch)
    await sql`INSERT INTO runs (id, name) VALUES (${SECOND_RUN}, 'Revoke Second Run 350') ON CONFLICT (id) DO NOTHING`
    await sql`DELETE FROM run_leaders WHERE run_id = ${SECOND_RUN}`
  })

  afterAll(async () => {
    await sql`DELETE FROM run_leaders WHERE run_id = ${CALLER_RUN}`
    await sql`DELETE FROM runs WHERE id = ${CALLER_RUN}`
    await sql`DELETE FROM run_leaders WHERE run_id = ${SECOND_RUN}`
    await sql`DELETE FROM runs WHERE id = ${SECOND_RUN}`
  })

  test('leadsAnyActiveRun: false when the user has no active run_leaders rows', async () => {
    const result = await leadsAnyActiveRun('clerk_nonexistent_user_350')
    expect(result).toBe(false)
  })

  test('leadsAnyActiveRun: true when the user has an active run_leaders row', async () => {
    const result = await leadsAnyActiveRun(CALLER_CLERK_ID)
    expect(result).toBe(true)
  })

  test('removed leader has NO other active run → updateUser called stripping role, preserving admin:true', async () => {
    // Insert the co-leader row to remove (only member of CALLER_RUN besides caller)
    const [row] = await sql`
      INSERT INTO run_leaders (run_id, name, email, clerk_user_id, sort_order, active)
      VALUES (${CALLER_RUN}, ${REMOVED_NAME}, ${REMOVED_EMAIL}, ${REMOVED_CLERK_ID}, 2, true)
      ON CONFLICT (run_id, email) WHERE email IS NOT NULL DO UPDATE SET active = true, clerk_user_id = ${REMOVED_CLERK_ID}
      RETURNING id
    `
    removedLeaderId = row.id as number

    signInAs(CALLER_CLERK_ID, { role: 'leader' })
    // getUser is called by revokeLeaderRoleIfOrphaned to fetch current publicMetadata
    mockGetUser.mockResolvedValue({
      id: REMOVED_CLERK_ID,
      publicMetadata: { role: 'leader', admin: true },
    })
    mockUpdateUser.mockClear()

    const res = await removeRunLeader(removedLeaderId)
    expect(res.error).toBeUndefined()

    // updateUser must be called exactly once, stripping role but preserving admin:true
    expect(mockUpdateUser).toHaveBeenCalledOnce()
    const [calledUserId, calledArgs] = mockUpdateUser.mock.calls[0] as [
      string,
      { publicMetadata: Record<string, unknown> },
    ]
    expect(calledUserId).toBe(REMOVED_CLERK_ID)
    expect(calledArgs.publicMetadata).toEqual({ admin: true })
    expect(calledArgs.publicMetadata).not.toHaveProperty('role')
  })

  test('removed leader STILL leads another active run → updateUser NOT called', async () => {
    // Re-insert the co-leader into CALLER_RUN and ALSO add them to SECOND_RUN
    const [row] = await sql`
      INSERT INTO run_leaders (run_id, name, email, clerk_user_id, sort_order, active)
      VALUES (${CALLER_RUN}, ${REMOVED_NAME}, ${REMOVED_EMAIL}, ${REMOVED_CLERK_ID}, 2, true)
      ON CONFLICT (run_id, email) WHERE email IS NOT NULL DO UPDATE SET active = true, clerk_user_id = ${REMOVED_CLERK_ID}
      RETURNING id
    `
    removedLeaderId = row.id as number
    // Add to the second run so leadsAnyActiveRun returns true after deactivation from CALLER_RUN
    await sql`
      INSERT INTO run_leaders (run_id, name, email, clerk_user_id, sort_order, active)
      VALUES (${SECOND_RUN}, ${REMOVED_NAME}, ${REMOVED_EMAIL}, ${REMOVED_CLERK_ID}, 1, true)
      ON CONFLICT (run_id, email) WHERE email IS NOT NULL DO UPDATE SET active = true, clerk_user_id = ${REMOVED_CLERK_ID}
    `

    signInAs(CALLER_CLERK_ID, { role: 'leader' })
    mockGetUser.mockResolvedValue({
      id: REMOVED_CLERK_ID,
      publicMetadata: { role: 'leader', admin: true },
    })
    mockUpdateUser.mockClear()

    const res = await removeRunLeader(removedLeaderId)
    expect(res.error).toBeUndefined()

    // Role must NOT be revoked — the user still leads SECOND_RUN
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })
})
