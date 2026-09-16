import { describe, test, expect, vi, beforeEach } from 'vitest'

// Unit test for revokeLeaderRoleIfOrphaned — fully local, no DB or Clerk network.
//
// Regression: when getUser throws a 404 (Clerk user doesn't exist — e.g. Preview
// DB forked from prod but app runs on dev Clerk instance, or a deleted account),
// the function must treat that as a no-op (no user → no role to revoke). Any
// other error must still be rethrown so a user who genuinely should lose their
// leader role never silently keeps it.
//
// Mocking strategy:
//   - '@clerk/nextjs/server' — mocked so clerkClient() returns a controlled fake
//     whose users.getUser / users.updateUser we set per test.
//   - './db' (relative, as runLeaders.ts imports it) — mocked so leadsAnyActiveRun
//     is a controllable vi.fn(), and the module-level DATABASE_URL import-throw
//     doesn't fire (same guard pattern as runConfigLeaders.test.ts).

const { mockGetUser, mockUpdateUser } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockUpdateUser: vi.fn(),
}))

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn().mockResolvedValue({
    users: {
      getUser: mockGetUser,
      updateUser: mockUpdateUser,
    },
  }),
}))

vi.mock('../lib/db', () => ({
  leadsAnyActiveRun: vi.fn(),
}))

import { leadsAnyActiveRun } from '../lib/db'
import { revokeLeaderRoleIfOrphaned } from '../lib/runLeaders'

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Helper — build a Clerk-shaped 404 error (matching ClerkAPIResponseError).
// ---------------------------------------------------------------------------
function makeClerkError(status: number): Error & { status: number } {
  const err = new Error(status === 404 ? 'Not Found' : 'Internal Server Error') as Error & {
    status: number
  }
  err.status = status
  return err
}

// ---------------------------------------------------------------------------
// Test 1 — REGRESSION: 404 (Clerk user not found) is a no-op, does not throw.
// Before the fix this test FAILS because the 404 propagates as an unhandled throw.
// ---------------------------------------------------------------------------
describe('revokeLeaderRoleIfOrphaned', () => {
  test('not-found (404): resolves without throwing; updateUser is NOT called', async () => {
    vi.mocked(leadsAnyActiveRun).mockResolvedValue(false)
    mockGetUser.mockRejectedValue(makeClerkError(404))

    // Must resolve — no throw — even though getUser throws 404
    await expect(revokeLeaderRoleIfOrphaned('user_deleted_123')).resolves.toBeUndefined()
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  // ---------------------------------------------------------------------------
  // Test 2 — non-404 errors must still propagate (security requirement).
  // ---------------------------------------------------------------------------
  test('non-404 error (500): rethrows; updateUser is NOT called', async () => {
    vi.mocked(leadsAnyActiveRun).mockResolvedValue(false)
    mockGetUser.mockRejectedValue(makeClerkError(500))

    await expect(revokeLeaderRoleIfOrphaned('user_error_123')).rejects.toThrow('Internal Server Error')
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  // ---------------------------------------------------------------------------
  // Test 3 — happy path: role is stripped, other metadata keys preserved.
  // ---------------------------------------------------------------------------
  test('happy path: updateUser called once, role stripped, admin:true preserved', async () => {
    vi.mocked(leadsAnyActiveRun).mockResolvedValue(false)
    mockGetUser.mockResolvedValue({
      id: 'user_leader_happy',
      publicMetadata: { role: 'leader', admin: true },
    })
    mockUpdateUser.mockResolvedValue(undefined)

    await expect(revokeLeaderRoleIfOrphaned('user_leader_happy')).resolves.toBeUndefined()

    expect(mockUpdateUser).toHaveBeenCalledOnce()
    const [calledUserId, calledArgs] = mockUpdateUser.mock.calls[0] as [
      string,
      { publicMetadata: Record<string, unknown> },
    ]
    expect(calledUserId).toBe('user_leader_happy')
    expect(calledArgs.publicMetadata).toEqual({ admin: true })
    expect(calledArgs.publicMetadata).not.toHaveProperty('role')
  })

  // ---------------------------------------------------------------------------
  // Test 4 — still-leads short-circuit: getUser/updateUser never called.
  // ---------------------------------------------------------------------------
  test('still leads another run: getUser and updateUser are NOT called', async () => {
    vi.mocked(leadsAnyActiveRun).mockResolvedValue(true)

    await expect(revokeLeaderRoleIfOrphaned('user_multilead')).resolves.toBeUndefined()
    expect(mockGetUser).not.toHaveBeenCalled()
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })
})
