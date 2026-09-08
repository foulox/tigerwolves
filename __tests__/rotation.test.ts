import { describe, test, expect } from 'vitest'
import { getNextLeader, isLeaderAway } from '../lib/rotation'
import type { RunLeader } from '../lib/data'

const makeLeader = (name: string, sortOrder: number, awayPeriods: { from: string; to: string }[] = []): RunLeader => ({
  id: sortOrder,
  runId: 'test',
  clerkUserId: null,
  name,
  email: null,
  sortOrder,
  awayPeriods,
})

const roster = [
  makeLeader('Luis', 1),
  makeLeader('Lou', 2),
  makeLeader('Kelsey', 3),
  makeLeader('Obi', 4),
]

describe('isLeaderAway', () => {
  test('returns true when date falls within an away period', () => {
    const leader = makeLeader('Lou', 2, [{ from: '2025-12-23', to: '2026-01-04' }])
    expect(isLeaderAway(leader, '2025-12-30')).toBe(true)
  })

  test('returns false when date is outside all away periods', () => {
    const leader = makeLeader('Lou', 2, [{ from: '2025-12-23', to: '2026-01-04' }])
    expect(isLeaderAway(leader, '2025-12-22')).toBe(false)
    expect(isLeaderAway(leader, '2026-01-05')).toBe(false)
  })

  test('returns false when no away periods', () => {
    expect(isLeaderAway(roster[0], '2025-12-30')).toBe(false)
  })
})

describe('getNextLeader', () => {
  test('returns next in rotation after given name', () => {
    expect(getNextLeader(roster, 'Luis', '2025-11-01')).toBe('Lou')
    expect(getNextLeader(roster, 'Lou', '2025-11-01')).toBe('Kelsey')
  })

  test('wraps around after last leader', () => {
    expect(getNextLeader(roster, 'Obi', '2025-11-01')).toBe('Luis')
  })

  test('skips a leader who is away on the target date', () => {
    const rosterWithAway = [
      makeLeader('Luis', 1),
      makeLeader('Lou', 2, [{ from: '2025-12-23', to: '2026-01-04' }]),
      makeLeader('Kelsey', 3),
    ]
    expect(getNextLeader(rosterWithAway, 'Luis', '2025-12-30')).toBe('Kelsey')
  })

  test('returns null when all leaders are away', () => {
    const allAway = [
      makeLeader('Luis', 1, [{ from: '2025-12-23', to: '2026-01-04' }]),
      makeLeader('Lou', 2, [{ from: '2025-12-23', to: '2026-01-04' }]),
    ]
    expect(getNextLeader(allAway, 'Luis', '2025-12-30')).toBeNull()
  })
})
