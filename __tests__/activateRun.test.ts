// __tests__/activateRun.test.ts — same mock header as addDirectoryRun.test.ts,
// plus a partial mock of ../lib/runLeaders that keeps the real module but replaces
// assignLeaderByEmail with a vi.fn().
import { describe, test, expect, afterAll, vi } from 'vitest'
vi.mock('@clerk/nextjs/server', () => ({ currentUser: vi.fn(), clerkClient: vi.fn() }))
vi.mock('next/cache', async importOriginal => {
  const actual = await importOriginal<typeof import('next/cache')>()
  return { ...actual, updateTag: vi.fn() }
})
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
vi.mock('../lib/runLeaders', async importOriginal => {
  const actual = await importOriginal<typeof import('../lib/runLeaders')>()
  return { ...actual, assignLeaderByEmail: vi.fn() }
})
import { currentUser } from '@clerk/nextjs/server'
import { assignLeaderByEmail } from '../lib/runLeaders'
import { activateRun, addDirectoryRun } from '../app/admin/actions'
import { sql } from '../lib/db'

const TEST_DATA_HOST = 'ep-fragrant-sunset-atmdps9n-pooler.c-9.us-east-1.aws.neon.tech'
const onTestData = (process.env.DATABASE_URL ?? '').includes(TEST_DATA_HOST)
const PREFIX = 'test-activate-413'
function signInAs(id: string, meta: { role?: string; admin?: boolean } = {}) {
  vi.mocked(currentUser).mockResolvedValue({ id, publicMetadata: meta } as never)
}

describe('activateRun authorization', () => {
  test('non-admin is refused', async () => {
    signInAs('u_runner', {})
    expect((await activateRun('x', 'a@b.com')).error).toBe('Unauthorized')
  })
})

describe.skipIf(!onTestData)('activateRun', () => {
  afterAll(async () => {
    await sql`DELETE FROM run_leaders WHERE run_id IN (SELECT id FROM runs WHERE name LIKE ${PREFIX + '%'})`
    await sql`DELETE FROM runs WHERE name LIKE ${PREFIX + '%'}`
  })

  test('unknown email leaves the run unclaimed (no partial activation)', async () => {
    signInAs('u_admin', { admin: true })
    vi.mocked(assignLeaderByEmail).mockResolvedValue({ error: 'No account found for that email — they need to sign in once before they can be added.' })
    const { runId } = await addDirectoryRun({ name: `${PREFIX} Unknown`, day: 'Monday', time: '6am', location: 'A', distance: '3 mi', category: 'Easy Runs' })
    const res = await activateRun(runId!, 'nobody@nowhere.com')
    expect(res.error).toMatch(/sign in once/)
    expect((await sql`SELECT status FROM runs WHERE id = ${runId!}`)[0].status).toBe('unclaimed')
  })

  test('refuses a run that is not unclaimed', async () => {
    signInAs('u_admin', { admin: true })
    vi.mocked(assignLeaderByEmail).mockResolvedValue({})
    const { runId } = await addDirectoryRun({ name: `${PREFIX} Already`, day: 'Monday', time: '6am', location: 'A', distance: '3 mi', category: 'Easy Runs' })
    await sql`UPDATE runs SET status = 'draft' WHERE id = ${runId!}`
    expect((await activateRun(runId!, 'a@b.com')).error).toBe('This run is not unclaimed.')
  })

  test('assigns leader and flips unclaimed → draft on success', async () => {
    signInAs('u_admin', { admin: true })
    vi.mocked(assignLeaderByEmail).mockResolvedValue({})
    const { runId } = await addDirectoryRun({ name: `${PREFIX} Go`, day: 'Monday', time: '6am', location: 'A', distance: '3 mi', category: 'Easy Runs' })
    const res = await activateRun(runId!, 'leader@nbr.com')
    expect(res.error).toBeUndefined()
    expect(vi.mocked(assignLeaderByEmail)).toHaveBeenCalledWith(runId, 'leader@nbr.com')
    expect((await sql`SELECT status FROM runs WHERE id = ${runId!}`)[0].status).toBe('draft')
  })
})
