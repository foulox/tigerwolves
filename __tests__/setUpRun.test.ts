// __tests__/setUpRun.test.ts — same mock header as addDirectoryRun.test.ts.
// setUpRun no longer touches lib/runLeaders (no leader assignment), so there's
// no partial mock of that module here.
import { describe, test, expect, afterAll, vi } from 'vitest'
vi.mock('@clerk/nextjs/server', () => ({ currentUser: vi.fn(), clerkClient: vi.fn() }))
vi.mock('next/cache', async importOriginal => {
  const actual = await importOriginal<typeof import('next/cache')>()
  return { ...actual, updateTag: vi.fn() }
})
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
import { currentUser } from '@clerk/nextjs/server'
import { setUpRun, addDirectoryRun } from '../app/admin/actions'
import { sql } from '../lib/db'

const TEST_DATA_HOST = 'ep-fragrant-sunset-atmdps9n-pooler.c-9.us-east-1.aws.neon.tech'
const onTestData = (process.env.DATABASE_URL ?? '').includes(TEST_DATA_HOST)
const PREFIX = 'test-setup-444'
function signInAs(id: string, meta: { role?: string; admin?: boolean } = {}) {
  vi.mocked(currentUser).mockResolvedValue({ id, publicMetadata: meta } as never)
}

describe('setUpRun authorization', () => {
  test('non-admin is refused', async () => {
    signInAs('u_runner', {})
    expect((await setUpRun('x')).error).toBe('Unauthorized')
  })
})

describe.skipIf(!onTestData)('setUpRun', () => {
  afterAll(async () => {
    await sql`DELETE FROM run_leaders WHERE run_id IN (SELECT id FROM runs WHERE name LIKE ${PREFIX + '%'})`
    await sql`DELETE FROM runs WHERE name LIKE ${PREFIX + '%'}`
  })

  test('refuses a run that is not unclaimed', async () => {
    signInAs('u_admin', { admin: true })
    const { runId } = await addDirectoryRun({ name: `${PREFIX} Already`, day: 'Monday', time: '6am', location: 'A', distance: '3 mi', category: 'Easy Runs' })
    await sql`UPDATE runs SET status = 'draft' WHERE id = ${runId!}`
    expect((await setUpRun(runId!)).error).toBe('This run is not unclaimed.')
  })

  test('flips unclaimed → draft and creates NO run_leaders row', async () => {
    signInAs('u_admin', { admin: true })
    const { runId } = await addDirectoryRun({ name: `${PREFIX} Go`, day: 'Monday', time: '6am', location: 'A', distance: '3 mi', category: 'Easy Runs' })
    const res = await setUpRun(runId!)
    expect(res.error).toBeUndefined()
    const row = (await sql`SELECT status, run_group_id FROM runs WHERE id = ${runId!}`)[0]
    expect(row.status).toBe('draft')
    expect(row.run_group_id).not.toBeNull()
    // AC: setUpRun never creates a leader row.
    expect((await sql`SELECT 1 FROM run_leaders WHERE run_id = ${runId!}`).length).toBe(0)
  })
})
