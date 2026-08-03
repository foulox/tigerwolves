import { describe, it, expect, vi, beforeEach } from 'vitest'

const { dbFlagWorkoutMock, dbFixWorkoutAndClearFlagMock, captureServerEventMock, authMock, WorkoutNotFoundError } = vi.hoisted(() => {
  class WorkoutNotFoundError extends Error {
    constructor(name: string, variation: string) {
      super(`Workout ${name} (${variation}) not found`)
      this.name = 'WorkoutNotFoundError'
    }
  }
  return {
    dbFlagWorkoutMock: vi.fn().mockResolvedValue(undefined),
    dbFixWorkoutAndClearFlagMock: vi.fn().mockResolvedValue(undefined),
    captureServerEventMock: vi.fn().mockResolvedValue(undefined),
    authMock: vi.fn().mockResolvedValue({ userId: null }),
    WorkoutNotFoundError,
  }
})

vi.mock('@/lib/db', () => ({
  dbSetScheduleWorkout: vi.fn(),
  dbInsertWorkout: vi.fn(),
  dbUpdateWorkout: vi.fn(),
  dbDeleteWorkout: vi.fn(),
  dbRegroupFamily: vi.fn(),
  dbInsertRace: vi.fn(),
  dbFlagRace: vi.fn(),
  dbVerifyRace: vi.fn(),
  dbFixRace: vi.fn(),
  dbFlagWorkout: dbFlagWorkoutMock,
  dbFixWorkoutAndClearFlag: dbFixWorkoutAndClearFlagMock,
  WorkoutNotFoundError,
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

beforeEach(() => {
  vi.clearAllMocks()
  authMock.mockResolvedValue({ userId: null })
})

describe('flagWorkoutIssue', () => {
  it('returns an error when note is blank', async () => {
    const result = await flagWorkoutIssue('Yasso 800s', '', '   ')
    expect(result).toEqual({ error: 'Description is required' })
    expect(dbFlagWorkoutMock).not.toHaveBeenCalled()
  })

  it('flags the workout with the trimmed note', async () => {
    await flagWorkoutIssue('Yasso 800s', '', '  we run 8 reps not 6  ')
    expect(dbFlagWorkoutMock).toHaveBeenCalledWith('Yasso 800s', '', 'we run 8 reps not 6')
  })

  it('fires workout_flagged anonymously by default', async () => {
    await flagWorkoutIssue('Yasso 800s', '', 'wrong reps')
    expect(captureServerEventMock).toHaveBeenCalledWith('workout_flagged', 'anonymous-runner', { isLeader: false })
  })

  it('fires workout_flagged with the real userId and isLeader=true for a signed-in leader', async () => {
    authMock.mockResolvedValue({ userId: 'user_leader_1' })
    await flagWorkoutIssue('Yasso 800s', '', 'wrong reps')
    expect(captureServerEventMock).toHaveBeenCalledWith('workout_flagged', 'user_leader_1', { isLeader: true })
  })

  it('returns a friendly error instead of throwing when the workout was renamed/moved underneath it', async () => {
    dbFlagWorkoutMock.mockRejectedValueOnce(new WorkoutNotFoundError('Yasso 800s', ''))
    const result = await flagWorkoutIssue('Yasso 800s', '', 'wrong reps')
    expect(result).toEqual({ error: 'This workout may have changed since you opened this page — refresh and try again.' })
    expect(captureServerEventMock).not.toHaveBeenCalled()
  })

  it('still propagates an unexpected (non-not-found) DB error rather than swallowing it', async () => {
    dbFlagWorkoutMock.mockRejectedValueOnce(new Error('connection reset'))
    await expect(flagWorkoutIssue('Yasso 800s', '', 'wrong reps')).rejects.toThrow('connection reset')
  })
})

describe('fixWorkoutAndClearFlag', () => {
  const fields = { reason: 'VO2max intervals', distTime: '8 x 800m', instructions: 'Warm up 15 min' }

  it('throws Unauthorized when not signed in, before any field validation runs', async () => {
    await expect(fixWorkoutAndClearFlag('Yasso 800s', '', fields)).rejects.toThrow('Unauthorized')
    expect(dbFixWorkoutAndClearFlagMock).not.toHaveBeenCalled()
  })

  it('returns an error when reason is blank', async () => {
    authMock.mockResolvedValue({ userId: 'user_leader_1' })
    const result = await fixWorkoutAndClearFlag('Yasso 800s', '', { ...fields, reason: '   ' })
    expect(result).toEqual({ error: 'Reason is required' })
    expect(dbFixWorkoutAndClearFlagMock).not.toHaveBeenCalled()
  })

  it('fixes the workout when signed in with valid fields', async () => {
    authMock.mockResolvedValue({ userId: 'user_leader_1' })
    const result = await fixWorkoutAndClearFlag('Yasso 800s', '', fields)
    expect(result).toBeUndefined()
    expect(dbFixWorkoutAndClearFlagMock).toHaveBeenCalledWith('Yasso 800s', '', fields)
    expect(captureServerEventMock).toHaveBeenCalledWith('workout_fixed', 'user_leader_1', { isLeader: true })
  })

  it('trims fields before saving', async () => {
    authMock.mockResolvedValue({ userId: 'user_leader_1' })
    await fixWorkoutAndClearFlag('Yasso 800s', '', { reason: '  VO2max  ', distTime: '  8 x 800m  ', instructions: '  warm up  ' })
    expect(dbFixWorkoutAndClearFlagMock).toHaveBeenCalledWith('Yasso 800s', '', {
      reason: 'VO2max',
      distTime: '8 x 800m',
      instructions: 'warm up',
    })
  })

  it('returns a friendly error instead of throwing when the workout was renamed/moved underneath it', async () => {
    authMock.mockResolvedValue({ userId: 'user_leader_1' })
    dbFixWorkoutAndClearFlagMock.mockRejectedValueOnce(new WorkoutNotFoundError('Yasso 800s', ''))
    const result = await fixWorkoutAndClearFlag('Yasso 800s', '', fields)
    expect(result).toEqual({ error: 'This workout may have changed since you opened this page — refresh and try again.' })
    expect(captureServerEventMock).not.toHaveBeenCalled()
  })

  it('still propagates an unexpected (non-not-found) DB error rather than swallowing it', async () => {
    authMock.mockResolvedValue({ userId: 'user_leader_1' })
    dbFixWorkoutAndClearFlagMock.mockRejectedValueOnce(new Error('connection reset'))
    await expect(fixWorkoutAndClearFlag('Yasso 800s', '', fields)).rejects.toThrow('connection reset')
  })
})
