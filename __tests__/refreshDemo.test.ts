import { describe, test, expect } from 'vitest'
import { isDemoHost } from '../scripts/refresh-demo'

describe('isDemoHost', () => {
  test('returns true when DATABASE_URL contains the demo host', () => {
    expect(isDemoHost('postgres://u:p@ep-ancient-math-atvtz5p9.example/db')).toBe(true)
  })

  test('returns false when DATABASE_URL contains a different host (e.g. E2E branch)', () => {
    expect(isDemoHost('postgres://u:p@ep-fragrant-sunset.example/db')).toBe(false)
  })

  test('returns false when DATABASE_URL is undefined', () => {
    expect(isDemoHost(undefined)).toBe(false)
  })
})
