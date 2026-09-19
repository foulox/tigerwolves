import { describe, test, expect } from 'vitest'
import { isDemoHost, buildRelinkPlan, DEMO_LEADERS } from '../scripts/refresh-demo'

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

describe('buildRelinkPlan', () => {
  const fullIdMap = {
    'foulox@gmail.com': 'user_A',
    'cicifox@gmail.com': 'user_B',
  }

  test('returns one descriptor per leader with correct runId, email, and clerkUserId', () => {
    const plan = buildRelinkPlan(DEMO_LEADERS, fullIdMap)
    expect(plan).toHaveLength(DEMO_LEADERS.length)
    expect(plan[0]).toEqual({ runId: 'tigerwolves', email: 'foulox@gmail.com', clerkUserId: 'user_A' })
    expect(plan[1]).toEqual({ runId: 'wednesday-mourning-doves', email: 'cicifox@gmail.com', clerkUserId: 'user_B' })
  })

  test('returned order and pairing match the input leaders list', () => {
    const reversed = [DEMO_LEADERS[1], DEMO_LEADERS[0]]
    const plan = buildRelinkPlan(reversed, fullIdMap)
    expect(plan[0].runId).toBe('wednesday-mourning-doves')
    expect(plan[0].clerkUserId).toBe('user_B')
    expect(plan[1].runId).toBe('tigerwolves')
    expect(plan[1].clerkUserId).toBe('user_A')
  })

  test('throws with the missing email when an email is unresolved', () => {
    const partialMap = { 'foulox@gmail.com': 'user_A' }
    expect(() => buildRelinkPlan(DEMO_LEADERS, partialMap)).toThrow('cicifox@gmail.com')
  })

  test('thrown error message names the missing email and mentions demo Clerk instance', () => {
    const partialMap = { 'cicifox@gmail.com': 'user_B' }
    expect(() => buildRelinkPlan(DEMO_LEADERS, partialMap)).toThrow(
      /foulox@gmail\.com[\s\S]*demo.*Clerk/i,
    )
  })
})
