import { describe, it, expect, vi, beforeEach } from 'vitest'

// #472: addWorkout/updateWorkout must return a friendly { error } on a validation
// failure instead of letting the ZodError throw uncaught into the Server Action
// boundary (which renders the raw "Server Components render" error). Validation is
// exercised for real here — @/lib/workoutVariant is NOT mocked.

const { dbInsertWorkoutVariantMock, dbUpdateWorkoutVariantMock, getLeaderRunMock, currentUserMock } = vi.hoisted(() => ({
  dbInsertWorkoutVariantMock: vi.fn().mockResolvedValue({ familyId: 1 }),
  dbUpdateWorkoutVariantMock: vi.fn().mockResolvedValue(undefined),
  getLeaderRunMock: vi.fn().mockResolvedValue(null),
  currentUserMock: vi.fn().mockResolvedValue({ id: 'u1', publicMetadata: { role: 'leader' } }),
}))

vi.mock('@/lib/db', () => ({
  sql: vi.fn(),
  dbSetScheduleWorkout: vi.fn(),
  dbInsertRace: vi.fn(), dbFlagRace: vi.fn(), dbVerifyRace: vi.fn(), dbFixRace: vi.fn(),
  dbInsertWorkoutVariant: dbInsertWorkoutVariantMock,
  dbUpdateWorkoutVariant: dbUpdateWorkoutVariantMock,
  dbAddWorkoutVariant: vi.fn(), dbDeleteWorkoutVariant: vi.fn(),
  dbFlagWorkoutVariant: vi.fn(), dbFixWorkoutVariantAndClearFlag: vi.fn(), dbRegroupVariants: vi.fn(),
  WorkoutVariantNotFoundError: class extends Error {},
  getLeaderRun: getLeaderRunMock, getRunById: vi.fn(),
  dbAdoptRoute: vi.fn(), dbUnadoptRoute: vi.fn(),
  leaderLeadsRun: vi.fn(), getWorkoutFamilyMeta: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/server', () => ({ after: vi.fn((fn: () => void) => fn()) }))
vi.mock('@/lib/analytics', () => ({ captureServerEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({ currentUser: currentUserMock, auth: vi.fn() }))

import { addWorkout, updateWorkout } from '../app/actions'
import { redirect } from 'next/navigation'

function fd(fields: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

const VALID_LONG = {
  name: 'Doves long run', category: 'Long', type: 'Long', reason: '', instructions: '',
  distTime: '', energySystem: '', hrZone: '', rpe: '', raceTypes: '', trainingPhases: '',
  author: '', coachingNotes: '', mapLink: '', runGroupId: '', hasTurnaround: 'false', turnaround: '',
  label: '', sortOrder: '', distanceMiles: '', elevationGainFeet: '', geometry: '',
}
// invalid: a Quality type on a Long run (the exact #473 crash trigger)
const INVALID_LONG = { ...VALID_LONG, type: 'Threshold' }

beforeEach(() => {
  vi.clearAllMocks()
  currentUserMock.mockResolvedValue({ id: 'u1', publicMetadata: { role: 'leader' } })
  getLeaderRunMock.mockResolvedValue(null)
  dbInsertWorkoutVariantMock.mockResolvedValue({ familyId: 1 })
})

describe('updateWorkout (#472 guard)', () => {
  it('returns a friendly { error } and does not write when validation fails', async () => {
    const result = await updateWorkout(7, fd(INVALID_LONG))
    expect(result).toMatchObject({ error: expect.stringContaining('not a valid type') })
    expect(dbUpdateWorkoutVariantMock).not.toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalled()
  })

  it('writes and redirects on a valid Long run', async () => {
    const result = await updateWorkout(7, fd(VALID_LONG))
    expect(result).toBeUndefined()
    expect(dbUpdateWorkoutVariantMock).toHaveBeenCalledOnce()
    expect(redirect).toHaveBeenCalledWith('/library')
  })
})

describe('addWorkout (#472 guard)', () => {
  it('returns a friendly { error } and does not insert when validation fails', async () => {
    const result = await addWorkout(fd(INVALID_LONG))
    expect(result).toMatchObject({ error: expect.stringContaining('not a valid type') })
    expect(dbInsertWorkoutVariantMock).not.toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalled()
  })

  it('inserts and redirects on a valid Long run', async () => {
    const result = await addWorkout(fd(VALID_LONG))
    expect(result).toBeUndefined()
    expect(dbInsertWorkoutVariantMock).toHaveBeenCalledOnce()
    expect(redirect).toHaveBeenCalledWith('/library')
  })
})
