import { describe, it, expect, afterEach } from 'vitest'
import { GET } from '@/app/api/health/route'

describe('GET /api/health', () => {
  const originalDb = process.env.DATABASE_URL

  afterEach(() => {
    if (originalDb === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = originalDb
  })

  it('reports the host of DATABASE_URL (the branch this deploy reads)', async () => {
    process.env.DATABASE_URL =
      'postgresql://u:p@ep-ancient-math-atvtz5p9-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require'

    const body = await (await GET()).json()

    expect(body.dbHost).toBe('ep-ancient-math-atvtz5p9-pooler.us-east-2.aws.neon.tech')
    expect(body.ok).toBe(true)
  })

  it('never leaks the connection secret (host only, no user/password)', async () => {
    process.env.DATABASE_URL =
      'postgresql://neondb_owner:npg_supersecret@ep-ancient-math-atvtz5p9-pooler.us-east-2.aws.neon.tech/neondb'

    const serialized = JSON.stringify(await (await GET()).json())

    expect(serialized).not.toContain('npg_supersecret')
    expect(serialized).not.toContain('neondb_owner')
  })

  it('reports ok:false with null host when no database url is configured', async () => {
    delete process.env.DATABASE_URL

    const body = await (await GET()).json()

    expect(body.dbHost).toBeNull()
    expect(body.ok).toBe(false)
  })
})
