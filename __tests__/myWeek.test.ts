import { describe, test, expect } from 'vitest'
import {
  addDays,
  dayLabel,
  feedWindow,
  weekStripCells,
  groupByDay,
  compactCardFields,
  truncateSet,
  type MyWeekItem,
} from '../lib/myWeek'
import type { RunConfig, ScheduleEntry, WorkoutVariantRow } from '../lib/data'

function makeRun(overrides: Partial<RunConfig> = {}): RunConfig {
  return {
    id: 'tigerwolves',
    name: 'TigerWolves',
    emoji: '🐯🐺',
    dayOfWeek: 'Tuesday',
    meetingLocation: 'Da Bins',
    postHeader: '',
    leaderIntro: '',
    closingNotes: '',
    kind: 'Workout',
    workoutTypes: [],
    runGroupId: 1,
    cycleMode: 'none',
    cycle: {},
    ...overrides,
  }
}

function makeEntry(overrides: Partial<ScheduleEntry> = {}): ScheduleEntry {
  return {
    date: '2026-09-15',
    weekOfMonth: 3,
    workoutType: 'Interval',
    leader: 'Dana Kim',
    workoutName: 'Yasso 800s',
    selectedVariations: [''],
    ...overrides,
  }
}

function makeWorkout(overrides: Partial<WorkoutVariantRow> = {}): WorkoutVariantRow {
  return {
    id: 1, familyId: 1, name: 'Yasso 800s', label: null, sortOrder: null,
    category: 'Quality', type: 'Interval', reason: '', rawInput: '10x800m @ 5K effort, 400m jog recovery.',
    distTime: '', energySystem: '', hrZone: '', rpe: '', coachingNotes: null, mapLink: null,
    author: null, raceTypes: [], trainingPhases: [], hasTurnaround: false, turnaround: '',
    flagged: false, flagNote: '', runGroupId: 1, lastRan: null,
    ...overrides,
  }
}

function makeItem(overrides: Partial<MyWeekItem> = {}): MyWeekItem {
  return {
    run: makeRun(),
    date: '2026-09-15',
    entry: makeEntry(),
    workout: makeWorkout(),
    ...overrides,
  }
}

describe('addDays', () => {
  test('adds days across a month boundary without timezone drift', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2026-09-15', 7)).toBe('2026-09-22')
  })
})

describe('dayLabel', () => {
  const today = '2026-09-15' // a Tuesday (UTC)
  test('labels today as Today', () => {
    expect(dayLabel('2026-09-15', today)).toBe('Today')
  })
  test('labels the next day as Tomorrow', () => {
    expect(dayLabel('2026-09-16', today)).toBe('Tomorrow')
  })
  test('labels other days by full weekday name', () => {
    expect(dayLabel('2026-09-17', today)).toBe('Thursday')
    expect(dayLabel('2026-09-14', today)).toBe('Monday')
  })
})

describe('feedWindow', () => {
  const today = '2026-09-15'
  test('offset 0 is a couple past days through ~7 forward', () => {
    expect(feedWindow(today, 0)).toEqual({ start: '2026-09-13', end: '2026-09-22' })
  })
  test('navigating forward one week shifts to a clean 7-day block', () => {
    expect(feedWindow(today, 1)).toEqual({ start: '2026-09-22', end: '2026-09-28' })
  })
  test('navigating back one week shifts to the prior 7-day block', () => {
    expect(feedWindow(today, -1)).toEqual({ start: '2026-09-08', end: '2026-09-14' })
  })
})

describe('weekStripCells', () => {
  const today = '2026-09-15'
  test('returns 7 day cells starting at the offset week start', () => {
    const cells = weekStripCells(today, 0)
    expect(cells).toHaveLength(7)
    expect(cells[0].date).toBe('2026-09-15')
    expect(cells[6].date).toBe('2026-09-21')
  })
  test('marks today in the offset-0 strip and nowhere in a shifted strip', () => {
    expect(weekStripCells(today, 0).some(c => c.isToday)).toBe(true)
    expect(weekStripCells(today, 1).some(c => c.isToday)).toBe(false)
  })
  test('carries weekday short name and day-of-month number', () => {
    const cells = weekStripCells(today, 0)
    expect(cells[0].weekdayShort).toBe('Tue')
    expect(cells[0].dayNum).toBe(15)
  })
})

describe('groupByDay', () => {
  const today = '2026-09-15'
  test('groups items by date, ordered ascending, with day labels', () => {
    const items = [
      makeItem({ date: '2026-09-16', run: makeRun({ id: 'mmer', name: 'MMER' }) }),
      makeItem({ date: '2026-09-15', run: makeRun({ id: 'tigerwolves', name: 'TigerWolves' }) }),
    ]
    const groups = groupByDay(items, today)
    expect(groups.map(g => g.date)).toEqual(['2026-09-15', '2026-09-16'])
    expect(groups[0].label).toBe('Today')
    expect(groups[1].label).toBe('Tomorrow')
  })
  test('keeps multiple runs on the same day in one group, ordered by run name', () => {
    const items = [
      makeItem({ date: '2026-09-15', run: makeRun({ id: 'mmer', name: 'MMER' }) }),
      makeItem({ date: '2026-09-15', run: makeRun({ id: 'tigerwolves', name: 'TigerWolves' }) }),
    ]
    const groups = groupByDay(items, today)
    expect(groups).toHaveLength(1)
    expect(groups[0].items.map(i => i.run.name)).toEqual(['MMER', 'TigerWolves'])
  })
})

describe('compactCardFields', () => {
  test('Workout kind → type pill + truncated set line, no route fields', () => {
    const fields = compactCardFields('Workout', makeEntry({ workoutType: 'Interval' }), makeWorkout())
    expect(fields).toMatchObject({
      shape: 'workout',
      typePill: 'Interval',
      setLine: '10x800m @ 5K effort, 400m jog recovery.',
    })
  })
  test('Easy/route kind → distance + route link, no type pill', () => {
    const workout = makeWorkout({ distTime: '4 miles', mapLink: 'https://maps.example/loop' })
    const fields = compactCardFields('Easy', makeEntry({ workoutType: 'Easy' }), workout)
    expect(fields).toEqual({
      shape: 'route',
      distance: '4 miles',
      routeLink: 'https://maps.example/loop',
    })
  })
  test('route kind with no workout yields null distance and link', () => {
    const fields = compactCardFields('Easy', makeEntry(), null)
    expect(fields).toEqual({ shape: 'route', distance: null, routeLink: null })
  })
  test('workout kind with no workout yields a null set line but still the type pill', () => {
    const fields = compactCardFields('Workout', makeEntry({ workoutType: 'Hills' }), null)
    expect(fields).toEqual({ shape: 'workout', typePill: 'Hills', setLine: null })
  })
})

describe('truncateSet', () => {
  test('collapses whitespace and leaves short strings intact', () => {
    expect(truncateSet('10x800m @ 5K effort')).toBe('10x800m @ 5K effort')
    expect(truncateSet('WU 15min\n  main set')).toBe('WU 15min main set')
  })
  test('truncates long strings with an ellipsis', () => {
    const long = 'a'.repeat(80)
    const out = truncateSet(long, 60)
    expect(out.length).toBe(60)
    expect(out.endsWith('…')).toBe(true)
  })
})
