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
// staging (same guard as activateNbrRun.test.ts / runConfigAuth.test.ts).

const { mockGetUserList, mockUpdateUser } = vi.hoisted(() => ({
  mockGetUserList: vi.fn(),
  mockUpdateUser: vi.fn(),
}))

vi.mock('@clerk/nextjs/server', () => ({
  currentUser: vi.fn(),
  clerkClient: vi.fn().mockResolvedValue({
    users: {
      getUserList: mockGetUserList,
      updateUser: mockUpdateUser,
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
import { addRunLeaderByEmail } from '../app/run-config/actions'

// Staging-only DB tests gated with describe.skipIf(!onStaging). CI sets
// DATABASE_URL to the staging branch; local dev has no DATABASE_URL and the
// module fails to load off-staging (same documented behavior as activateNbrRun.test.ts).
const STAGING_HOST = 'ep-fragrant-sunset-atmdps9n-pooler.c-9.us-east-1.aws.neon.tech'
const onStaging = (process.env.DATABASE_URL ?? '').includes(STAGING_HOST)

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
// STAGING — real DB writes; skipped when DATABASE_URL is not the staging branch.
// ---------------------------------------------------------------------------

describe.skipIf(!onStaging)('addRunLeaderByEmail grant path (staging)', () => {
  // A dedicated run + owning leader row. We use 'tigerwolves' as the cross-run
  // target (it already exists on staging). The caller leads their own separate run.
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
    mockClerkUser({ id: COLEADER_CLERK_ID, email: COLEADER_EMAIL })
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
