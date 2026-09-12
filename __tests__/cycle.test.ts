import { describe, it, expect } from 'vitest'
import { resolveWorkoutType } from '../lib/cycle'

// The real TigerWolves cadence, keyed by week-of-month (weekOfMonth = ceil(day/7)):
//   week 1 → Hills, 2 → Broken Tempo, 3 → Progression, 4 → Ladder or Superset, 5 → Straight Tempo.
const TW_CYCLE = {
  '1': 'Hills',
  '2': 'Broken Tempo',
  '3': 'Progression',
  '4': 'Ladder or Superset',
  '5': 'Straight Tempo',
}

describe('resolveWorkoutType', () => {
  it('maps week-of-month to the TigerWolves cadence', () => {
    // day 3 → week 1, day 10 → week 2, day 24 → week 4, day 30 → week 5.
    expect(resolveWorkoutType('week_of_month', TW_CYCLE, '2026-09-03')).toBe('Hills')
    expect(resolveWorkoutType('week_of_month', TW_CYCLE, '2026-09-10')).toBe('Broken Tempo')
    expect(resolveWorkoutType('week_of_month', TW_CYCLE, '2026-09-24')).toBe('Ladder or Superset')
    expect(resolveWorkoutType('week_of_month', TW_CYCLE, '2026-09-30')).toBe('Straight Tempo')
  })

  it("returns '' for cycle_mode none", () => {
    expect(resolveWorkoutType('none', {}, '2026-09-03')).toBe('')
    // A populated cycle is ignored when the mode is 'none'.
    expect(resolveWorkoutType('none', TW_CYCLE, '2026-09-03')).toBe('')
  })

  it("returns '' for a week slot the map omits", () => {
    const noFifth = { '1': 'Hills', '2': 'Broken Tempo', '3': 'Progression', '4': 'Ladder or Superset' }
    // 2026-09-30 is a 5th-week date; the map has no "5" key.
    expect(resolveWorkoutType('week_of_month', noFifth, '2026-09-30')).toBe('')
  })

  it("returns '' for a null/unknown mode or null cycle", () => {
    expect(resolveWorkoutType(null, TW_CYCLE, '2026-09-03')).toBe('')
    expect(resolveWorkoutType('week_of_month', null, '2026-09-03')).toBe('')
  })
})
