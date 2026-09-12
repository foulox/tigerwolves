import { describe, test, expect } from 'vitest'
import { computePlatformMap, computeTiers, NBR_TO_DB_RUN } from '../lib/allRuns'
import { NBR_RUNS } from '../lib/allRunsData'

describe('computePlatformMap — dedup NBR directory ↔ platform runs', () => {
  test('maps NBR entries to platform runs that exist, carrying follow state', () => {
    const map = computePlatformMap(['tigerwolves', 'mmer'], ['tigerwolves'])
    expect(map['tue-tigerwolves']).toEqual({ runId: 'tigerwolves', following: true })
    expect(map['mon-morning-easy']).toEqual({ runId: 'mmer', following: false })
  })

  test('ignores a mapping whose target run is not on the platform yet', () => {
    // Only tigerwolves seeded — the mmer mapping must not render as joinable.
    const map = computePlatformMap(['tigerwolves'], [])
    expect(map['tue-tigerwolves']).toEqual({ runId: 'tigerwolves', following: false })
    expect(map['mon-morning-easy']).toBeUndefined()
  })

  test('no platform runs → empty map (logged-out / nothing seeded)', () => {
    expect(computePlatformMap([], [])).toEqual({})
  })

  test('every mapped platform run corresponds to a real NBR directory entry', () => {
    const nbrIds = new Set(NBR_RUNS.map(r => r.id))
    for (const nbrId of Object.keys(NBR_TO_DB_RUN)) {
      expect(nbrIds.has(nbrId)).toBe(true)
    }
  })
})

describe('computeTiers — following / on-app / more-NBR classification', () => {
  test('sorts runs into the three tiers with no overlap or loss', () => {
    const platform = computePlatformMap(['tigerwolves', 'mmer'], ['tigerwolves'])
    const { following, onApp, moreNbr } = computeTiers(NBR_RUNS, platform)

    // tigerwolves is followed → Following; mmer is joinable but not joined → On the app.
    expect(following.map(r => r.id)).toEqual(['tue-tigerwolves'])
    expect(onApp.map(r => r.id)).toEqual(['mon-morning-easy'])
    // Everything else is directory-only (not joinable).
    expect(moreNbr).toHaveLength(NBR_RUNS.length - 2)
    expect(moreNbr.some(r => r.id === 'tue-tigerwolves' || r.id === 'mon-morning-easy')).toBe(false)

    // Partition is total.
    expect(following.length + onApp.length + moreNbr.length).toBe(NBR_RUNS.length)
  })

  test('empty platform map → everything is more-NBR (logged out)', () => {
    const { following, onApp, moreNbr } = computeTiers(NBR_RUNS, {})
    expect(following).toHaveLength(0)
    expect(onApp).toHaveLength(0)
    expect(moreNbr).toHaveLength(NBR_RUNS.length)
  })
})
