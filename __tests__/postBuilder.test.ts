import { describe, test, expect } from 'vitest'
import { buildPost, formatMainContent } from '../lib/postBuilder'
import type { ScheduleEntry, WorkoutVariantRow } from '../lib/data'

const entry: ScheduleEntry = {
  date: '2026-06-24',
  weekOfMonth: 4,
  workoutType: 'Ladder',
  leader: 'Lou',
  workoutName: 'Tempo Ladder',
  selectedVariations: [''],
}

const baseWorkout: WorkoutVariantRow = {
  id: 1,
  familyId: 1,
  name: 'Tempo Ladder',
  label: null,
  sortOrder: null,
  category: 'Quality',
  type: 'Ladder',
  reason: 'Build lactate threshold',
  rawInput: 'WU: 15min. Main: 5min/4min/3min/2min/1min@tempo, r90s. CD: 10min.',
  distTime: '6-7 miles',
  energySystem: 'Lactate Threshold',
  hrZone: 'Z3-Z4',
  rpe: '7',
  coachingNotes: null,
  mapLink: null,
  author: null,
  raceTypes: [],
  trainingPhases: [],
  hasTurnaround: false,
  turnaround: '',
  flagged: false,
  flagNote: '',
  runGroupId: null,
  lastRan: null,
}

describe('buildPost', () => {
  test('single-workout post has TigerWolves header', () => {
    const post = buildPost(entry, [baseWorkout])
    expect(post).toContain('🐯🐺 TigerWolves Tuesday Workout')
  })

  test('app-usage CTA appears immediately after the opening line', () => {
    const post = buildPost(entry, [baseWorkout])
    const lines = post.split('\n')
    expect(lines[0]).toBe('🐯🐺 TigerWolves Tuesday Workout')
    expect(lines[1]).toBe('')
    expect(lines[2]).toBe('👉 https://tigerwolves.foulox.me 👈')
    expect(lines[3]).toBe('👀 See every workout between now and the NYC Marathon in the app')
    expect(lines[4]).toBe('🗳️ React to let us know what you like — and what you don\'t')
    expect(lines[5]).toBe('')
    expect(lines[6]).toContain('📅')
  })

  test('single-workout post has type: name line', () => {
    const post = buildPost(entry, [baseWorkout])
    expect(post).toContain('Ladder: Tempo Ladder')
  })

  test('single-workout post has location block', () => {
    const post = buildPost(entry, [baseWorkout])
    expect(post).toContain('Da Bins')
  })

  test('single-workout post has workout section', () => {
    const post = buildPost(entry, [baseWorkout])
    expect(post).toContain('🏁🏃🏻‍♂️‍➡️ WORKOUT')
  })

  test('single-workout post has leader and roster footer', () => {
    const post = buildPost(entry, [baseWorkout])
    expect(post).toContain('Led by Lou')
    expect(post).toContain('Run Leaders:')
  })

  test('single-workout post content comes from raw_input regardless of label', () => {
    const w = { ...baseWorkout, label: 'Shorter', rawInput: 'WU: 10min. Main: 2×(5-4-3-2-1 min) 1min easy. CD: 5min.' }
    const post = buildPost(entry, [w])
    expect(post).toContain('2×(5-4-3-2-1 min) 1min easy')
    expect(post).not.toContain('Shorter')
  })

  test('a lone variant (label = null) posts the same as a standalone workout', () => {
    const post = buildPost(entry, [baseWorkout])
    expect(post).toContain(formatMainContent(baseWorkout.rawInput))
  })

  test('turnaround line present when hasTurnaround=true and turnaround text is set', () => {
    const w = { ...baseWorkout, hasTurnaround: true, turnaround: 'After the 3rd rep' }
    const post = buildPost(entry, [w])
    expect(post).toContain('↩️ TURN AROUND: After the 3rd rep')
  })

  test('no turnaround line when hasTurnaround=false', () => {
    const post = buildPost(entry, [baseWorkout])
    expect(post).not.toContain('TURN AROUND')
  })

  test('turnaround line silently omitted when hasTurnaround=true but turnaround text is empty', () => {
    const w = { ...baseWorkout, hasTurnaround: true, turnaround: '' }
    const post = buildPost(entry, [w])
    expect(post).not.toContain('TURN AROUND')
  })

  test('two-variant post has Standard and Longer sections', () => {
    const standard = { ...baseWorkout, id: 1, label: 'Shorter', sortOrder: 1, rawInput: 'WU: 10min. Main: 3×5min@tempo. CD: 5min.' }
    const longer = { ...baseWorkout, id: 2, label: 'Longer', sortOrder: 2, rawInput: 'WU: 10min. Main: 4×5min@tempo. CD: 5min.' }
    const post = buildPost(entry, [standard, longer])
    expect(post).toContain('Standard')
    expect(post).toContain('Longer')
    expect(post).toContain('3×5min@tempo')
    expect(post).toContain('4×5min@tempo')
  })

  test('two-variant post formats each variant\'s content from its own raw_input', () => {
    const standard = { ...baseWorkout, id: 1, sortOrder: 1, rawInput: 'WU: 10min. Main: 3×5min@tempo. CD: 5min.' }
    const longer = { ...baseWorkout, id: 2, sortOrder: 2, rawInput: 'WU: 10min. Main: 4×5min@tempo. CD: 5min.' }
    const post = buildPost(entry, [standard, longer])
    expect(post).toContain(formatMainContent(standard.rawInput))
    expect(post).toContain(formatMainContent(longer.rawInput))
  })

  test('two-variant post shows independent turnaround per variant', () => {
    const standard = { ...baseWorkout, id: 1, sortOrder: 1, hasTurnaround: true, turnaround: 'After the 2nd rep' }
    const longer = { ...baseWorkout, id: 2, sortOrder: 2, hasTurnaround: true, turnaround: 'After the 3rd rep' }
    const post = buildPost(entry, [standard, longer])
    expect(post).toContain('After the 2nd rep')
    expect(post).toContain('After the 3rd rep')
  })

  test('two-variant post omits turnaround per variant when hasTurnaround is false or text is empty', () => {
    const standard = { ...baseWorkout, id: 1, sortOrder: 1, hasTurnaround: false }
    const longer = { ...baseWorkout, id: 2, sortOrder: 2, hasTurnaround: true, turnaround: '' }
    const post = buildPost(entry, [standard, longer])
    expect(post).not.toContain('TURN AROUND')
  })

  test('two-variant post header and footer are shared (not per-variant)', () => {
    const standard = { ...baseWorkout, id: 1, sortOrder: 1 }
    const longer = { ...baseWorkout, id: 2, sortOrder: 2 }
    const post = buildPost(entry, [standard, longer])
    // Header appears once
    expect(post.split('🐯🐺 TigerWolves Tuesday Workout').length).toBe(2)
    // Footer appears once
    expect(post.split('Run Leaders:').length).toBe(2)
  })

  test('two-variant post orders Standard/Longer by sort_order, not selection order', () => {
    const standard = { ...baseWorkout, id: 1, sortOrder: 1, rawInput: 'WU: 10min. Main: 3×5min@tempo. CD: 5min.' }
    const longer = { ...baseWorkout, id: 2, sortOrder: 2, rawInput: 'WU: 10min. Main: 4×5min@tempo. CD: 5min.' }
    const post = buildPost(entry, [longer, standard])
    const standardIdx = post.indexOf('Standard')
    const longerIdx = post.indexOf('Longer')
    expect(standardIdx).toBeGreaterThan(-1)
    expect(longerIdx).toBeGreaterThan(standardIdx)
  })
})
