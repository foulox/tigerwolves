import { describe, it, expect, vi, beforeEach } from 'vitest'

const { currentUserMock } = vi.hoisted(() => ({
  currentUserMock: vi.fn().mockResolvedValue(null),
}))

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn().mockResolvedValue({ userId: null }),
  currentUser: currentUserMock,
}))

vi.mock('@/lib/db', () => ({
  dbSetScheduleWorkout: vi.fn(),
  dbInsertWorkoutVariant: vi.fn(),
  dbUpdateWorkoutVariant: vi.fn(),
  dbAddWorkoutVariant: vi.fn(),
  dbDeleteWorkoutVariant: vi.fn(),
  dbRegroupVariants: vi.fn(),
  dbInsertRace: vi.fn(),
  dbFlagRace: vi.fn(),
  dbVerifyRace: vi.fn(),
  dbFixRace: vi.fn(),
  dbFlagWorkoutVariant: vi.fn(),
  dbFixWorkoutVariantAndClearFlag: vi.fn(),
  WorkoutVariantNotFoundError: class WorkoutVariantNotFoundError extends Error {},
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }))
vi.mock('@/lib/analytics', () => ({ captureServerEvent: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/server', () => ({ after: vi.fn((fn: () => void) => fn()) }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))

// verifyRace is the thinnest action that calls requireAuth() and returns its result
// to captureServerEvent — exercising the full path without UI noise.
// deleteWorkout is the one action gated by requireAdmin (#404 review) rather than
// requireAuth, so it exercises the admin-only path.
import { verifyRace, deleteWorkout } from '../app/actions'
import { dbDeleteWorkoutVariant } from '@/lib/db'

beforeEach(() => {
  vi.clearAllMocks()
  currentUserMock.mockResolvedValue(null)
})

describe('requireAuth', () => {
  it('throws Unauthorized when currentUser() returns null', async () => {
    currentUserMock.mockResolvedValue(null)
    await expect(verifyRace(1)).rejects.toThrow('Unauthorized')
  })

  it('throws Unauthorized when user has no role in publicMetadata', async () => {
    currentUserMock.mockResolvedValue({ id: 'user_123', publicMetadata: {} })
    await expect(verifyRace(1)).rejects.toThrow('Unauthorized')
  })

  it('throws Unauthorized when publicMetadata.role is "runner"', async () => {
    currentUserMock.mockResolvedValue({ id: 'user_123', publicMetadata: { role: 'runner' } })
    await expect(verifyRace(1)).rejects.toThrow('Unauthorized')
  })

  it('returns user.id when publicMetadata.role is "leader"', async () => {
    currentUserMock.mockResolvedValue({ id: 'user_leader_1', publicMetadata: { role: 'leader' } })
    await verifyRace(1)
    // If requireAuth() returned the correct id, verifyRace completes without throwing
    expect(currentUserMock).toHaveBeenCalledOnce()
  })
})

// #404 (review): a route delete is global, so deleteWorkout is gated to the cross-run
// admin flag (publicMetadata.admin === true) — a plain leader can no longer delete.
describe('requireAdmin (deleteWorkout is admin-only)', () => {
  it('rejects a leader without the admin flag', async () => {
    currentUserMock.mockResolvedValue({ id: 'user_leader_1', publicMetadata: { role: 'leader' } })
    await expect(deleteWorkout(1)).rejects.toThrow('Unauthorized')
    expect(dbDeleteWorkoutVariant).not.toHaveBeenCalled()
  })

  it('rejects a signed-out user', async () => {
    currentUserMock.mockResolvedValue(null)
    await expect(deleteWorkout(1)).rejects.toThrow('Unauthorized')
    expect(dbDeleteWorkoutVariant).not.toHaveBeenCalled()
  })

  it('allows a cross-run admin (publicMetadata.admin === true)', async () => {
    currentUserMock.mockResolvedValue({ id: 'user_admin_1', publicMetadata: { admin: true } })
    await deleteWorkout(7)
    expect(dbDeleteWorkoutVariant).toHaveBeenCalledWith(7)
  })
})
