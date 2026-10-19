import { describe, test, expect } from 'vitest'
import { scheduleFilterCount, scheduleFilterSummary, type ScheduleFilters } from '../lib/scheduleFilters'

const EMPTY: ScheduleFilters = { showAllRuns: false, typeLabel: null, browseCategory: null, browseType: null, rating: 'any' }

describe('scheduleFilterCount / scheduleFilterSummary', () => {
  test('a fresh Your-run Hills week: type shown, nothing else', () => {
    const f: ScheduleFilters = { ...EMPTY, typeLabel: 'Hills' }
    expect(scheduleFilterCount(f)).toBe(1)
    expect(scheduleFilterSummary(f)).toBe('Hills')
  })

  test('cleared to all types: no narrowing', () => {
    expect(scheduleFilterCount(EMPTY)).toBe(0)
    expect(scheduleFilterSummary(EMPTY)).toBe('')
  })

  test('Your-run Hills + a rating threshold', () => {
    const f: ScheduleFilters = { ...EMPTY, typeLabel: 'Hills', rating: 'good' }
    expect(scheduleFilterCount(f)).toBe(2)
    expect(scheduleFilterSummary(f)).toBe('Hills · 😃 & up')
  })

  test('All-runs with browse category + type: scope + both pills count; typeLabel ignored', () => {
    const f: ScheduleFilters = { showAllRuns: true, typeLabel: null, browseCategory: 'Easy', browseType: 'Progressive', rating: 'any' }
    expect(scheduleFilterCount(f)).toBe(3)
    expect(scheduleFilterSummary(f)).toBe('All runs · Easy · Progressive')
  })
})
