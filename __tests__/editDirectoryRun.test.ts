// __tests__/editDirectoryRun.test.ts — same mock + gate header as addDirectoryRun.test.ts
import { describe, test, expect, afterAll, vi } from 'vitest'
vi.mock('@clerk/nextjs/server', () => ({ currentUser: vi.fn(), clerkClient: vi.fn() }))
vi.mock('next/cache', async importOriginal => {
  const actual = await importOriginal<typeof import('next/cache')>()
  return { ...actual, updateTag: vi.fn() }
})
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
import { currentUser } from '@clerk/nextjs/server'
import { sql } from '../lib/db'
import { editDirectoryRun, addDirectoryRun } from '../app/admin/actions'

const TEST_DATA_HOST = 'ep-fragrant-sunset-atmdps9n-pooler.c-9.us-east-1.aws.neon.tech'
const onTestData = (process.env.DATABASE_URL ?? '').includes(TEST_DATA_HOST)
const PREFIX = 'test-edit-413'
function signInAs(id: string, meta: { role?: string; admin?: boolean } = {}) {
  vi.mocked(currentUser).mockResolvedValue({ id, publicMetadata: meta } as never)
}

describe('editDirectoryRun authorization', () => {
  test('non-admin is refused', async () => {
    signInAs('u_runner', {})
    const res = await editDirectoryRun('any-run', { name: 'x', day: 'Monday', time: '6am', location: 'y', distance: '1 mi', category: 'Easy Runs' })
    expect(res.error).toBe('Unauthorized')
  })
})

describe.skipIf(!onTestData)('editDirectoryRun persistence', () => {
  afterAll(async () => { await sql`DELETE FROM runs WHERE name LIKE ${PREFIX + '%'}` })

  test('updates all six fields and maps category to kind', async () => {
    signInAs('u_admin', { admin: true })
    const { runId } = await addDirectoryRun({ name: `${PREFIX} Orig`, day: 'Monday', time: '6:00am', location: 'A', distance: '3 mi', category: 'Easy Runs' })
    const res = await editDirectoryRun(runId!, { name: `${PREFIX} Renamed`, day: 'Tuesday', time: '7:00pm', location: 'B', distance: '5 mi', category: 'Workouts' })
    expect(res.error).toBeUndefined()
    const row = (await sql`SELECT name, day_of_week, meeting_time, meeting_location, distance, kind FROM runs WHERE id = ${runId!}`)[0]
    expect(row.name).toBe(`${PREFIX} Renamed`)
    expect(row.day_of_week).toBe('Tuesday')
    expect(row.meeting_time).toBe('7:00pm')
    expect(row.meeting_location).toBe('B')
    expect(row.distance).toBe('5 mi')
    expect(row.kind).toBe('Workout') // NBR_CATEGORY_TO_KIND['Workouts']
  })
})
