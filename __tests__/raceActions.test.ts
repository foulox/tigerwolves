import { describe, it, expect, vi, beforeEach } from 'vitest'

const { dbInsertRaceMock, dbFlagRaceMock, dbVerifyRaceMock, dbFixRaceMock, captureServerEventMock, authMock } = vi.hoisted(() => ({
  dbInsertRaceMock: vi.fn().mockResolvedValue(42),
  dbFlagRaceMock: vi.fn().mockResolvedValue(undefined),
  dbVerifyRaceMock: vi.fn().mockResolvedValue(undefined),
  dbFixRaceMock: vi.fn().mockResolvedValue(undefined),
  captureServerEventMock: vi.fn().mockResolvedValue(undefined),
  authMock: vi.fn().mockResolvedValue({ userId: null }),
}))

vi.mock('@/lib/db', () => ({
  dbSetScheduleWorkout: vi.fn(),
  dbInsertWorkoutVariant: vi.fn(),
  dbUpdateWorkoutVariant: vi.fn(),
  dbAddWorkoutVariant: vi.fn(),
  dbDeleteWorkoutVariant: vi.fn(),
  dbRegroupVariants: vi.fn(),
  dbInsertRace: dbInsertRaceMock,
  dbFlagRace: dbFlagRaceMock,
  dbVerifyRace: dbVerifyRaceMock,
  dbFixRace: dbFixRaceMock,
  dbFlagWorkoutVariant: vi.fn(),
  dbFixWorkoutVariantAndClearFlag: vi.fn(),
  WorkoutVariantNotFoundError: class WorkoutVariantNotFoundError extends Error {},
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

import { addRace, flagRaceIssue, verifyRace, fixRaceAndClearFlag } from '../app/actions'

beforeEach(() => {
  vi.clearAllMocks()
  authMock.mockResolvedValue({ userId: null })
  dbInsertRaceMock.mockResolvedValue(42)
})

describe('addRace', () => {
  it('returns an error when name is blank', async () => {
    const result = await addRace({ name: '  ', date: '2026-11-01', distance: '', location: '', organizer: '' })
    expect(result).toEqual({ error: 'Race name is required' })
    expect(dbInsertRaceMock).not.toHaveBeenCalled()
  })

  it('returns an error when date is blank', async () => {
    const result = await addRace({ name: 'NYC Marathon', date: '', distance: '', location: '', organizer: '' })
    expect(result).toEqual({ error: 'Date is required' })
    expect(dbInsertRaceMock).not.toHaveBeenCalled()
  })

  it('returns an error when date is not a real calendar date', async () => {
    const result = await addRace({ name: 'NYC Marathon', date: '2026-02-30', distance: '', location: '', organizer: '' })
    expect(result).toEqual({ error: 'Enter a valid date' })
    expect(dbInsertRaceMock).not.toHaveBeenCalled()
  })

  it('returns an error when date is malformed', async () => {
    const result = await addRace({ name: 'NYC Marathon', date: 'not-a-date', distance: '', location: '', organizer: '' })
    expect(result).toEqual({ error: 'Enter a valid date' })
    expect(dbInsertRaceMock).not.toHaveBeenCalled()
  })

  it('inserts a race as unverified and returns its id on valid input, defaulting a blank organizer', async () => {
    const result = await addRace({ name: '  NYC Marathon  ', date: '2026-11-01', distance: '26.2 mi', location: 'NYC', organizer: '  ' })
    expect(result).toEqual({ id: 42 })
    expect(dbInsertRaceMock).toHaveBeenCalledWith({
      name: 'NYC Marathon',
      date: '2026-11-01',
      distance: '26.2 mi',
      location: 'NYC',
      organizer: 'a club member',
      verified: false,
      flagged: false,
      flagNote: '',
    })
  })

  it('fires race_added anonymously by default', async () => {
    await addRace({ name: 'NYC Marathon', date: '2026-11-01', distance: '', location: '', organizer: '' })
    expect(captureServerEventMock).toHaveBeenCalledWith('race_added', 'anonymous-runner', { isLeader: false })
  })

  it('fires race_added with the real userId and isLeader=true for a signed-in leader', async () => {
    authMock.mockResolvedValue({ userId: 'user_leader_1' })
    await addRace({ name: 'NYC Marathon', date: '2026-11-01', distance: '', location: '', organizer: '' })
    expect(captureServerEventMock).toHaveBeenCalledWith('race_added', 'user_leader_1', { isLeader: true })
  })
})

describe('flagRaceIssue', () => {
  it('returns an error when note is blank', async () => {
    const result = await flagRaceIssue(1, '   ')
    expect(result).toEqual({ error: 'Description is required' })
    expect(dbFlagRaceMock).not.toHaveBeenCalled()
  })

  it('flags the race with the trimmed note', async () => {
    await flagRaceIssue(1, '  wrong date  ')
    expect(dbFlagRaceMock).toHaveBeenCalledWith(1, 'wrong date')
  })

  it('fires race_flagged anonymously by default', async () => {
    await flagRaceIssue(1, 'wrong date')
    expect(captureServerEventMock).toHaveBeenCalledWith('race_flagged', 'anonymous-runner', { raceId: 1, isLeader: false })
  })

  it('fires race_flagged with the real userId and isLeader=true for a signed-in leader', async () => {
    authMock.mockResolvedValue({ userId: 'user_leader_1' })
    await flagRaceIssue(1, 'wrong date')
    expect(captureServerEventMock).toHaveBeenCalledWith('race_flagged', 'user_leader_1', { raceId: 1, isLeader: true })
  })
})

describe('verifyRace', () => {
  it('throws Unauthorized when not signed in', async () => {
    await expect(verifyRace(1)).rejects.toThrow('Unauthorized')
    expect(dbVerifyRaceMock).not.toHaveBeenCalled()
  })

  it('verifies the race when signed in', async () => {
    authMock.mockResolvedValue({ userId: 'user_leader_1' })
    await verifyRace(1)
    expect(dbVerifyRaceMock).toHaveBeenCalledWith(1)
    expect(captureServerEventMock).toHaveBeenCalledWith('race_verified', 'user_leader_1', { raceId: 1, isLeader: true })
  })
})

describe('fixRaceAndClearFlag', () => {
  const fields = { name: 'NYC Marathon', date: '2026-11-01', distance: '26.2 mi', location: 'NYC' }

  it('throws Unauthorized when not signed in, before any field validation runs', async () => {
    await expect(fixRaceAndClearFlag(1, fields)).rejects.toThrow('Unauthorized')
    expect(dbFixRaceMock).not.toHaveBeenCalled()
  })

  it('returns an error when name is blank', async () => {
    authMock.mockResolvedValue({ userId: 'user_leader_1' })
    const result = await fixRaceAndClearFlag(1, { ...fields, name: '  ' })
    expect(result).toEqual({ error: 'Race name is required' })
    expect(dbFixRaceMock).not.toHaveBeenCalled()
  })

  it('returns an error when date is not a real calendar date', async () => {
    authMock.mockResolvedValue({ userId: 'user_leader_1' })
    const result = await fixRaceAndClearFlag(1, { ...fields, date: '2026-13-01' })
    expect(result).toEqual({ error: 'Enter a valid date' })
    expect(dbFixRaceMock).not.toHaveBeenCalled()
  })

  it('fixes the race when signed in with valid fields', async () => {
    authMock.mockResolvedValue({ userId: 'user_leader_1' })
    const result = await fixRaceAndClearFlag(1, fields)
    expect(result).toBeUndefined()
    expect(dbFixRaceMock).toHaveBeenCalledWith(1, fields)
    expect(captureServerEventMock).toHaveBeenCalledWith('race_fixed', 'user_leader_1', { raceId: 1, isLeader: true })
  })
})
