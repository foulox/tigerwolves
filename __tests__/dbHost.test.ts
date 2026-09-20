import { describe, it, expect } from 'vitest'
import { resolveDbUrl, extractHost } from '@/lib/dbHost'

describe('resolveDbUrl', () => {
  it('returns DATABASE_URL (mirrors lib/db.ts)', () => {
    expect(resolveDbUrl({ DATABASE_URL: 'prod' })).toBe('prod')
  })

  it('ignores DEMO_DATABASE_URL — it is retired; the demo now sets its own DATABASE_URL', () => {
    expect(resolveDbUrl({ DEMO_DATABASE_URL: 'demo', DATABASE_URL: 'prod' })).toBe('prod')
  })

  it('returns undefined when DATABASE_URL is not set', () => {
    expect(resolveDbUrl({})).toBeUndefined()
  })
})

describe('extractHost', () => {
  const url = 'postgresql://neondb_owner:npg_secretpassword@ep-ancient-math-atvtz5p9-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require'

  it('returns the hostname of the connection string', () => {
    expect(extractHost(url)).toBe('ep-ancient-math-atvtz5p9-pooler.us-east-2.aws.neon.tech')
  })

  it('never leaks the username or password', () => {
    const host = extractHost(url) ?? ''
    expect(host).not.toContain('neondb_owner')
    expect(host).not.toContain('npg_secretpassword')
    expect(host).not.toContain('@')
  })

  it('returns null for an undefined url', () => {
    expect(extractHost(undefined)).toBeNull()
  })

  it('returns null for an unparseable url', () => {
    expect(extractHost('not a url')).toBeNull()
  })
})
