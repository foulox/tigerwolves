// __tests__/addDirectoryRun.test.ts — mirror createRun.test.ts's mock + gate setup.
import { describe, test, expect, afterAll, vi } from 'vitest'
vi.mock('@clerk/nextjs/server', () => ({ currentUser: vi.fn(), clerkClient: vi.fn() }))
vi.mock('next/cache', async importOriginal => {
  const actual = await importOriginal<typeof import('next/cache')>()
  return { ...actual, updateTag: vi.fn() }
})
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
import { currentUser } from '@clerk/nextjs/server'
import { sql } from '../lib/db'
import { addDirectoryRun } from '../app/admin/actions'

const TEST_DATA_HOST = 'ep-fragrant-sunset-atmdps9n-pooler.c-9.us-east-1.aws.neon.tech'
const onTestData = (process.env.DATABASE_URL ?? '').includes(TEST_DATA_HOST)
const PREFIX = 'test-add-413'
function signInAs(id: string, meta: { role?: string; admin?: boolean } = {}) {
  vi.mocked(currentUser).mockResolvedValue({ id, publicMetadata: meta } as never)
}
const base = { day: 'Saturday', time: '7:00am', location: 'McCarren Park', distance: '10–22 mi', category: 'Long Runs' as const }

describe('addDirectoryRun authorization', () => {
  test('non-admin leader is refused', async () => {
    signInAs('u_leader', { role: 'leader' })
    const res = await addDirectoryRun({ name: `${PREFIX} A`, ...base })
    expect(res.error).toBe('Unauthorized')
  })
})

describe.skipIf(!onTestData)('addDirectoryRun persistence', () => {
  afterAll(async () => { await sql`DELETE FROM runs WHERE name LIKE ${PREFIX + '%'}` })

  test('inserts an unclaimed row with distance and mapped kind', async () => {
    signInAs('u_admin', { admin: true })
    const res = await addDirectoryRun({ name: `${PREFIX} Narwhals`, ...base })
    expect(res.error).toBeUndefined()
    const row = (await sql`SELECT status, distance, kind FROM runs WHERE id = ${res.runId!}`)[0]
    expect(row.status).toBe('unclaimed')
    expect(row.distance).toBe('10–22 mi')
    expect(row.kind).toBe('Long') // NBR_CATEGORY_TO_KIND['Long Runs']
  })

  test('slug collision on same-slug name gets a -2 suffix, does not overwrite', async () => {
    signInAs('u_admin', { admin: true })
    const first = await addDirectoryRun({ name: `${PREFIX} Dupe`, ...base })
    const second = await addDirectoryRun({ name: `${PREFIX} Dupe!`, ...base }) // slugifies the same
    expect(second.error).toBeUndefined()
    expect(second.runId).not.toBe(first.runId)
    expect(second.runId).toMatch(/-2$/)
  })

  test('exact duplicate name is rejected', async () => {
    signInAs('u_admin', { admin: true })
    await addDirectoryRun({ name: `${PREFIX} Exact`, ...base })
    const dup = await addDirectoryRun({ name: `${PREFIX} Exact`, ...base })
    expect(dup.error).toBe('A run with this name already exists')
  })
})
