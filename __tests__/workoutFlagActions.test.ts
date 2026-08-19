import { describe, it, expect, vi, beforeEach } from 'vitest'

const { dbFlagWorkoutVariantMock, dbFixWorkoutVariantAndClearFlagMock, captureServerEventMock, authMock, WorkoutVariantNotFoundError } = vi.hoisted(() => {
  class WorkoutVariantNotFoundError extends Error {
    constructor(variantId: number) {
      super(`Workout variant ${variantId} not found`)
      this.name = 'WorkoutVariantNotFoundError'
    }
  }
  return {
    dbFlagWorkoutVariantMock: vi.fn().mockResolvedValue(undefined),
    dbFixWorkoutVariantAndClearFlagMock: vi.fn().mockResolvedValue(undefined),
    captureServerEventMock: vi.fn().mockResolvedValue(undefined),
    authMock: vi.fn().mockResolvedValue({ userId: null }),
    WorkoutVariantNotFoundError,
  }
})

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
  dbFlagWorkoutVariant: dbFlagWorkoutVariantMock,
  dbFixWorkoutVariantAndClearFlag: dbFixWorkoutVariantAndClearFlagMock,
  WorkoutVariantNotFoundError,
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}))

vi.mock('@/lib/analytics', () => ({
  captureServerEvent: captureServerEventMock,
}))

vi.mock('@clerk/nextjs/server', () => ({
  auth: authMock,
  currentUser: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

vi.mock('next/server', () => ({
  after: vi.fn((fn: () => void) => fn()),
}))

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))

import { flagWorkoutIssue, fixWorkoutAndClearFlag } from '../app/actions'

const VARIANT_ID = 42

beforeEach(() => {
  vi.clearAllMocks()
  authMock.mockResolvedValue({ userId: null })
})

describe('flagWorkoutIssue', () => {
  it('returns an error when note is blank', async () => {
    const result = await flagWorkoutIssue(VARIANT_ID, '   ')
    expect(result).toEqual({ error: 'Description is required' })
    expect(dbFlagWorkoutVariantMock).not.toHaveBeenCalled()
  })

  it('flags the workout with the trimmed note', async () => {
    await flagWorkoutIssue(VARIANT_ID, '  we run 8 reps not 6  ')
    expect(dbFlagWorkoutVariantMock).toHaveBeenCalledWith(VARIANT_ID, 'we run 8 reps not 6')
  })

  it('fires workout_flagged anonymously by default', async () => {
    await flagWorkoutIssue(VARIANT_ID, 'wrong reps')
    expect(captureServerEventMock).toHaveBeenCalledWith('workout_flagged', 'anonymous-runner', { isLeader: false })
  })

  it('fires workout_flagged with the real userId and isLeader=true for a signed-in leader', async () => {
    authMock.mockResolvedValue({ userId: 'user_leader_1' })
    await flagWorkoutIssue(VARIANT_ID, 'wrong reps')
    expect(captureServerEventMock).toHaveBeenCalledWith('workout_flagged', 'user_leader_1', { isLeader: true })
  })

  it('returns a friendly error instead of throwing when the workout was renamed/moved underneath it', async () => {
    dbFlagWorkoutVariantMock.mockRejectedValueOnce(new WorkoutVariantNotFoundError(VARIANT_ID))
    const result = await flagWorkoutIssue(VARIANT_ID, 'wrong reps')
    expect(result).toEqual({ error: 'This workout may have changed since you opened this page — refresh and try again.' })
    expect(captureServerEventMock).not.toHaveBeenCalled()
  })

  it('still propagates an unexpected (non-not-found) DB error rather than swallowing it', async () => {
    dbFlagWorkoutVariantMock.mockRejectedValueOnce(new Error('connection reset'))
    await expect(flagWorkoutIssue(VARIANT_ID, 'wrong reps')).rejects.toThrow('connection reset')
  })
})

describe('fixWorkoutAndClearFlag', () => {
  const fields = { reason: 'VO2max intervals', distTime: '8 x 800m', instructions: 'Warm up 15 min' }

  it('throws Unauthorized when not signed in, before any field validation runs', async () => {
    await expect(fixWorkoutAndClearFlag(VARIANT_ID, fields)).rejects.toThrow('Unauthorized')
    expect(dbFixWorkoutVariantAndClearFlagMock).not.toHaveBeenCalled()
  })

  it('returns an error when reason is blank', async () => {
    authMock.mockResolvedValue({ userId: 'user_leader_1' })
    const result = await fixWorkoutAndClearFlag(VARIANT_ID, { ...fields, reason: '   ' })
    expect(result).toEqual({ error: 'Reason is required' })
    expect(dbFixWorkoutVariantAndClearFlagMock).not.toHaveBeenCalled()
  })

  it('fixes the workout when signed in with valid fields', async () => {
    authMock.mockResolvedValue({ userId: 'user_leader_1' })
    const result = await fixWorkoutAndClearFlag(VARIANT_ID, fields)
    expect(result).toBeUndefined()
    expect(dbFixWorkoutVariantAndClearFlagMock).toHaveBeenCalledWith(VARIANT_ID, fields)
    expect(captureServerEventMock).toHaveBeenCalledWith('workout_fixed', 'user_leader_1', { isLeader: true })
  })

  it('trims fields before saving', async () => {
    authMock.mockResolvedValue({ userId: 'user_leader_1' })
    await fixWorkoutAndClearFlag(VARIANT_ID, { reason: '  VO2max  ', distTime: '  8 x 800m  ', instructions: '  warm up  ' })
    expect(dbFixWorkoutVariantAndClearFlagMock).toHaveBeenCalledWith(VARIANT_ID, {
      reason: 'VO2max',
      distTime: '8 x 800m',
      instructions: 'warm up',
    })
  })

  it('returns a friendly error instead of throwing when the workout was renamed/moved underneath it', async () => {
    authMock.mockResolvedValue({ userId: 'user_leader_1' })
    dbFixWorkoutVariantAndClearFlagMock.mockRejectedValueOnce(new WorkoutVariantNotFoundError(VARIANT_ID))
    const result = await fixWorkoutAndClearFlag(VARIANT_ID, fields)
    expect(result).toEqual({ error: 'This workout may have changed since you opened this page — refresh and try again.' })
    expect(captureServerEventMock).not.toHaveBeenCalled()
  })

  it('still propagates an unexpected (non-not-found) DB error rather than swallowing it', async () => {
    authMock.mockResolvedValue({ userId: 'user_leader_1' })
    dbFixWorkoutVariantAndClearFlagMock.mockRejectedValueOnce(new Error('connection reset'))
    await expect(fixWorkoutAndClearFlag(VARIANT_ID, fields)).rejects.toThrow('connection reset')
  })
})
