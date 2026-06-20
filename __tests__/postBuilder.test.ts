import { describe, test, expect } from 'vitest'
import { computeTurnaround, buildPost } from '../lib/postBuilder'
import type { ScheduleEntry, Workout } from '../lib/data'

// ── computeTurnaround ────────────────────────────────────────────────────────

describe('computeTurnaround', () => {
  test('seconds reps — 2×30s turns around after 1st rep (halfway)', () => {
    const result = computeTurnaround('WU: 10min. Main: 2×30s. CD: 5min.')
    expect(result).toContain('↩️ TURN AROUND')
    expect(result).toContain('1st')
  })

  test('minutes reps — 3×5min turns around after 2nd rep', () => {
    const result = computeTurnaround('WU: 10min. Main: 3×5min. CD: 5min.')
    expect(result).toContain('↩️ TURN AROUND')
    expect(result).toContain('2nd')
  })

  test('no Main: section returns placeholder', () => {
    expect(computeTurnaround('Just go run fast for a while')).toBe(
      '↩️ TURN AROUND: [add before posting]'
    )
  })

  test('/-separated intervals', () => {
    const result = computeTurnaround('WU: 10min. Main: 4×5min / 2min easy. CD: 5min.')
    expect(result).toContain('↩️ TURN AROUND')
  })

  test('+-separated segments', () => {
    const result = computeTurnaround('WU: 10min. Main: 10min + 8min + 6min. CD: 5min.')
    expect(result).toContain('↩️ TURN AROUND')
  })

  test('"N sets of" notation', () => {
    const result = computeTurnaround('WU: 10min. Main: 3 sets of (5min/2min). CD: 5min.')
    expect(result).toContain('↩️ TURN AROUND')
  })

  test('multi-rep halfway — 4 reps, turns at 2nd', () => {
    const result = computeTurnaround('WU: 10min. Main: 4×5min. CD: 5min.')
    expect(result).toContain('2nd')
  })
})

// ── buildPost ────────────────────────────────────────────────────────────────

const entry: ScheduleEntry = {
  date: '2026-06-24',
  weekOfMonth: 4,
  workoutType: 'Ladder',
  leader: 'Lou',
  workoutName: 'Tempo Ladder',
}

const baseWorkout: Workout = {
  name: 'Tempo Ladder',
  sport: 'Running',
  category: 'Quality',
  type: 'Ladder',
  reason: 'Build lactate threshold',
  instructions: 'WU: 15min. Main: 5min/4min/3min/2min/1min@tempo, r90s. CD: 10min.',
  distTime: '6-7 miles',
  lapStructure: '',
  energySystem: 'Lactate Threshold',
  hrZone: 'Z3-Z4',
  rpe: '7',
  lastRan: null,
  coachingNotes: null,
  mapLink: null,
  variation: '',
  progression: null,
  author: null,
  raceTypes: [],
  trainingPhases: [],
  hasTurnaround: false,
  turnaroundDistance: '',
}

describe('buildPost', () => {
  test('single-workout post has TigerWolves header', () => {
    const post = buildPost(entry, [baseWorkout])
    expect(post).toContain('🐯🐺 TigerWolves Tuesday Workout')
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

  test('turnaround line present when hasTurnaround=true', () => {
    const w = { ...baseWorkout, hasTurnaround: true, turnaroundDistance: 'After the 3rd rep' }
    const post = buildPost(entry, [w])
    expect(post).toContain('↩️ TURN AROUND: After the 3rd rep')
  })

  test('no turnaround line when hasTurnaround=false', () => {
    const post = buildPost(entry, [baseWorkout])
    expect(post).not.toContain('TURN AROUND')
  })

  test('turnaround fallback when distance is empty', () => {
    const w = { ...baseWorkout, hasTurnaround: true, turnaroundDistance: '' }
    const post = buildPost(entry, [w])
    expect(post).toContain('↩️ TURN AROUND: [add before posting]')
  })

  test('two-variation post has Standard and Longer sections', () => {
    const standard = { ...baseWorkout, variation: '3×5min@tempo', progression: 1 }
    const longer = { ...baseWorkout, variation: '4×5min@tempo', progression: 2 }
    const post = buildPost(entry, [standard, longer])
    expect(post).toContain('Standard')
    expect(post).toContain('Longer')
    expect(post).toContain('3×5min@tempo')
    expect(post).toContain('4×5min@tempo')
  })

  test('variation field used instead of formatted instructions', () => {
    const w = { ...baseWorkout, variation: '2×(5-4-3-2-1 min) 1min easy' }
    const post = buildPost(entry, [w])
    expect(post).toContain('2×(5-4-3-2-1 min) 1min easy')
  })

  test('two-variation post uses variation field for each subsection', () => {
    const standard = { ...baseWorkout, variation: '3×5min@tempo', progression: 1 }
    const longer = { ...baseWorkout, variation: '4×5min@tempo', progression: 2 }
    const post = buildPost(entry, [standard, longer])
    expect(post).toContain('3×5min@tempo')
    expect(post).toContain('4×5min@tempo')
  })

  test('two-variation post falls back to formatted instructions when variation is empty', () => {
    const standard = { ...baseWorkout, variation: '', progression: 1 }
    const longer = { ...baseWorkout, variation: '', progression: 2 }
    const post = buildPost(entry, [standard, longer])
    expect(post).toContain('Standard')
    expect(post).toContain('Longer')
    expect(post).toContain('🏁🏃🏻‍♂️‍➡️ WORKOUT')
  })

  test('two-variation post header and footer are shared (not per-variation)', () => {
    const standard = { ...baseWorkout, variation: '3×5min', progression: 1 }
    const longer = { ...baseWorkout, variation: '4×5min', progression: 2 }
    const post = buildPost(entry, [standard, longer])
    // Header appears once
    expect(post.split('🐯🐺 TigerWolves Tuesday Workout').length).toBe(2)
    // Footer appears once
    expect(post.split('Run Leaders:').length).toBe(2)
  })

  test('two-variation post shows independent turnaround per variation', () => {
    const standard = { ...baseWorkout, variation: '3×5min', progression: 1, hasTurnaround: true, turnaroundDistance: 'After the 2nd rep' }
    const longer = { ...baseWorkout, variation: '4×5min', progression: 2, hasTurnaround: true, turnaroundDistance: 'After the 3rd rep' }
    const post = buildPost(entry, [standard, longer])
    expect(post).toContain('After the 2nd rep')
    expect(post).toContain('After the 3rd rep')
  })

  test('two-variation post omits turnaround when hasTurnaround is false', () => {
    const standard = { ...baseWorkout, variation: '3×5min', progression: 1, hasTurnaround: false }
    const longer = { ...baseWorkout, variation: '4×5min', progression: 2, hasTurnaround: false }
    const post = buildPost(entry, [standard, longer])
    expect(post).not.toContain('TURN AROUND')
  })
})
