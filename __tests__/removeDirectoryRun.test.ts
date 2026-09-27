// __tests__/removeDirectoryRun.test.ts — same mock + gate header as addDirectoryRun.test.ts.
import { describe, test, expect, afterAll, vi } from 'vitest'
vi.mock('@clerk/nextjs/server', () => ({ currentUser: vi.fn(), clerkClient: vi.fn() }))
vi.mock('next/cache', async importOriginal => {
  const actual = await importOriginal<typeof import('next/cache')>()
  return { ...actual, updateTag: vi.fn() }
})
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
import { currentUser } from '@clerk/nextjs/server'
import { sql } from '../lib/db'
import { removeDirectoryRun, addDirectoryRun } from '../app/admin/actions'

const TEST_DATA_HOST = 'ep-fragrant-sunset-atmdps9n-pooler.c-9.us-east-1.aws.neon.tech'
const onTestData = (process.env.DATABASE_URL ?? '').includes(TEST_DATA_HOST)
const PREFIX = 'test-remove-413'
function signInAs(id: string, meta: { role?: string; admin?: boolean } = {}) {
  vi.mocked(currentUser).mockResolvedValue({ id, publicMetadata: meta } as never)
}

describe('removeDirectoryRun authorization', () => {
  test('non-admin is refused', async () => {
    signInAs('u_runner', {})
    expect((await removeDirectoryRun('x')).error).toBe('Unauthorized')
  })
})

describe.skipIf(!onTestData)('removeDirectoryRun', () => {
  afterAll(async () => {
    await sql`DELETE FROM run_leaders WHERE run_id IN (SELECT id FROM runs WHERE name LIKE ${PREFIX + '%'})`
    await sql`DELETE FROM runs WHERE name LIKE ${PREFIX + '%'}`
  })

  test('deletes an unclaimed stub with no dependencies', async () => {
    signInAs('u_admin', { admin: true })
    const { runId } = await addDirectoryRun({ name: `${PREFIX} Gone`, day: 'Sunday', time: '8am', location: 'A', distance: '3 mi', category: 'Easy Runs' })
    expect((await removeDirectoryRun(runId!)).error).toBeUndefined()
    expect((await sql`SELECT 1 FROM runs WHERE id = ${runId!}`).length).toBe(0)
  })

  test('refuses a run that has a leader', async () => {
    signInAs('u_admin', { admin: true })
    const { runId } = await addDirectoryRun({ name: `${PREFIX} Held`, day: 'Sunday', time: '8am', location: 'A', distance: '3 mi', category: 'Easy Runs' })
    await sql`INSERT INTO run_leaders (run_id, name, sort_order, active) VALUES (${runId!}, 'L', 1, true)`
    const res = await removeDirectoryRun(runId!)
    expect(res.error).toBe('This run has a leader, followers, or schedule — remove those first.')
    expect((await sql`SELECT 1 FROM runs WHERE id = ${runId!}`).length).toBe(1)
  })
})
