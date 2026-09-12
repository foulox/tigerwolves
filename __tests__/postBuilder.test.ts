import { describe, test, expect } from 'vitest'
import { buildPost, buildVerificationLabel, formatMainContent, formatDateLong } from '../lib/postBuilder'
import type { ScheduleEntry, WorkoutVariantRow, RunConfig } from '../lib/data'

const tigerWolvesConfig: RunConfig = {
  id: 'tigerwolves',
  name: 'TigerWolves',
  emoji: '🐯🐺',
  dayOfWeek: 'Tuesday',
  meetingLocation: [
    'Starting point and route: Tom Stofka Garden, aka "Da Bins."',
    "We'll warm up by jogging to Marsha P. Johnson which is at the corner of North 8th and Kent",
    'The run will be along the Kent Avenue Speedway',
    "We'll finish up back at Marsha P. Johnson State Park and cool down with a jog to the track",
  ].join('\n'),
  // post_header is the full opening block — header line, then the app link + standing
  // prompts. These used to be hardcoded in buildPost; they now live here (editable),
  // matching what runs.post_header stores in the DB (#310).
  postHeader: [
    '🐯🐺 TigerWolves Tuesday Workout',
    '',
    '👉 https://tigerwolves.foulox.me 👈',
    '👀 See every workout between now and the NYC Marathon in the app',
    '🗳️ React to let us know what you like — and what you don\'t',
  ].join('\n'),
  leaderIntro: 'Run Leaders:',
  closingNotes: 'Bag Drop: Sorry, Not available',
  kind: 'Workout',
  workoutTypes: ['Hills', 'Broken Tempo', 'Progression', 'Ladder', 'Superset', 'Straight Tempo', 'Threshold'],
  runGroupId: 1,
}

const tigerWolvesRoster = ['Luis', 'Lou', 'Kostas', 'Joelle', 'Kelsey', 'Obi', 'Jared']

// A second run with entirely different branding — proves buildPost is parameterized
// from the run config (nothing TigerWolves is hardcoded).
const mourningDovesConfig: RunConfig = {
  id: 'mourning-doves',
  name: 'Mourning Doves',
  emoji: '🕊️',
  dayOfWeek: 'Wednesday',
  meetingLocation: 'Prospect Park — Grand Army Plaza entrance',
  postHeader: [
    '🕊️ Mourning Doves Wednesday Run',
    '',
    'An easy, social midweek run.',
  ].join('\n'),
  leaderIntro: 'Your Mourning Doves leaders:',
  closingNotes: 'Coffee at the plaza after.',
  kind: 'Easy',
  workoutTypes: [],
  runGroupId: null,
}

const mourningDovesRoster = ['Priya', 'Sam']

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
    const post = buildPost(entry, [baseWorkout], tigerWolvesConfig, tigerWolvesRoster)
    expect(post).toContain('🐯🐺 TigerWolves Tuesday Workout')
  })

  test('app-usage CTA appears immediately after the opening line', () => {
    const post = buildPost(entry, [baseWorkout], tigerWolvesConfig, tigerWolvesRoster)
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
    const post = buildPost(entry, [baseWorkout], tigerWolvesConfig, tigerWolvesRoster)
    expect(post).toContain('Ladder: Tempo Ladder')
  })

  test('single-workout post has location block', () => {
    const post = buildPost(entry, [baseWorkout], tigerWolvesConfig, tigerWolvesRoster)
    expect(post).toContain('Da Bins')
  })

  test('single-workout post has workout section', () => {
    const post = buildPost(entry, [baseWorkout], tigerWolvesConfig, tigerWolvesRoster)
    expect(post).toContain('🏁🏃🏻‍♂️‍➡️ WORKOUT')
  })

  test('single-workout post has leader and roster footer', () => {
    const post = buildPost(entry, [baseWorkout], tigerWolvesConfig, tigerWolvesRoster)
    expect(post).toContain('Led by Lou')
    expect(post).toContain('Run Leaders:')
  })

  test('single-workout post content comes from raw_input regardless of label', () => {
    const w = { ...baseWorkout, label: 'Shorter', rawInput: 'WU: 10min. Main: 2×(5-4-3-2-1 min) 1min easy. CD: 5min.' }
    const post = buildPost(entry, [w], tigerWolvesConfig, tigerWolvesRoster)
    expect(post).toContain('2×(5-4-3-2-1 min) 1min easy')
    expect(post).not.toContain('Shorter')
  })

  test('a lone variant (label = null) posts the same as a standalone workout', () => {
    const post = buildPost(entry, [baseWorkout], tigerWolvesConfig, tigerWolvesRoster)
    expect(post).toContain(formatMainContent(baseWorkout.rawInput))
  })

  test('turnaround line present when hasTurnaround=true and turnaround text is set', () => {
    const w = { ...baseWorkout, hasTurnaround: true, turnaround: 'After the 3rd rep' }
    const post = buildPost(entry, [w], tigerWolvesConfig, tigerWolvesRoster)
    expect(post).toContain('↩️ TURN AROUND: After the 3rd rep')
  })

  test('no turnaround line when hasTurnaround=false', () => {
    const post = buildPost(entry, [baseWorkout], tigerWolvesConfig, tigerWolvesRoster)
    expect(post).not.toContain('TURN AROUND')
  })

  test('turnaround line silently omitted when hasTurnaround=true but turnaround text is empty', () => {
    const w = { ...baseWorkout, hasTurnaround: true, turnaround: '' }
    const post = buildPost(entry, [w], tigerWolvesConfig, tigerWolvesRoster)
    expect(post).not.toContain('TURN AROUND')
  })

  test('two-variant post has Standard and Longer sections', () => {
    const standard = { ...baseWorkout, id: 1, label: 'Shorter', sortOrder: 1, rawInput: 'WU: 10min. Main: 3×5min@tempo. CD: 5min.' }
    const longer = { ...baseWorkout, id: 2, label: 'Longer', sortOrder: 2, rawInput: 'WU: 10min. Main: 4×5min@tempo. CD: 5min.' }
    const post = buildPost(entry, [standard, longer], tigerWolvesConfig, tigerWolvesRoster)
    expect(post).toContain('Standard')
    expect(post).toContain('Longer')
    expect(post).toContain('3×5min@tempo')
    expect(post).toContain('4×5min@tempo')
  })

  test('two-variant post formats each variant\'s content from its own raw_input', () => {
    const standard = { ...baseWorkout, id: 1, sortOrder: 1, rawInput: 'WU: 10min. Main: 3×5min@tempo. CD: 5min.' }
    const longer = { ...baseWorkout, id: 2, sortOrder: 2, rawInput: 'WU: 10min. Main: 4×5min@tempo. CD: 5min.' }
    const post = buildPost(entry, [standard, longer], tigerWolvesConfig, tigerWolvesRoster)
    expect(post).toContain(formatMainContent(standard.rawInput))
    expect(post).toContain(formatMainContent(longer.rawInput))
  })

  test('two-variant post shows independent turnaround per variant', () => {
    const standard = { ...baseWorkout, id: 1, sortOrder: 1, hasTurnaround: true, turnaround: 'After the 2nd rep' }
    const longer = { ...baseWorkout, id: 2, sortOrder: 2, hasTurnaround: true, turnaround: 'After the 3rd rep' }
    const post = buildPost(entry, [standard, longer], tigerWolvesConfig, tigerWolvesRoster)
    expect(post).toContain('After the 2nd rep')
    expect(post).toContain('After the 3rd rep')
  })

  test('two-variant post omits turnaround per variant when hasTurnaround is false or text is empty', () => {
    const standard = { ...baseWorkout, id: 1, sortOrder: 1, hasTurnaround: false }
    const longer = { ...baseWorkout, id: 2, sortOrder: 2, hasTurnaround: true, turnaround: '' }
    const post = buildPost(entry, [standard, longer], tigerWolvesConfig, tigerWolvesRoster)
    expect(post).not.toContain('TURN AROUND')
  })

  test('two-variant post header and footer are shared (not per-variant)', () => {
    const standard = { ...baseWorkout, id: 1, sortOrder: 1 }
    const longer = { ...baseWorkout, id: 2, sortOrder: 2 }
    const post = buildPost(entry, [standard, longer], tigerWolvesConfig, tigerWolvesRoster)
    // Header appears once
    expect(post.split('🐯🐺 TigerWolves Tuesday Workout').length).toBe(2)
    // Footer appears once
    expect(post.split('Run Leaders:').length).toBe(2)
  })

  test('two-variant post orders Standard/Longer by sort_order, not selection order', () => {
    const standard = { ...baseWorkout, id: 1, sortOrder: 1, rawInput: 'WU: 10min. Main: 3×5min@tempo. CD: 5min.' }
    const longer = { ...baseWorkout, id: 2, sortOrder: 2, rawInput: 'WU: 10min. Main: 4×5min@tempo. CD: 5min.' }
    const post = buildPost(entry, [longer, standard], tigerWolvesConfig, tigerWolvesRoster)
    const standardIdx = post.indexOf('Standard')
    const longerIdx = post.indexOf('Longer')
    expect(standardIdx).toBeGreaterThan(-1)
    expect(longerIdx).toBeGreaterThan(standardIdx)
  })

  test('a different run produces its own branding — no TigerWolves bleed-through', () => {
    const post = buildPost(entry, [baseWorkout], mourningDovesConfig, mourningDovesRoster)
    // Mourning Doves branding, all sourced from its run config
    expect(post).toContain('🕊️ Mourning Doves Wednesday Run')
    expect(post).toContain('An easy, social midweek run.')
    expect(post).toContain('📍 Prospect Park — Grand Army Plaza entrance')
    expect(post).toContain('Your Mourning Doves leaders: Priya, Sam')
    expect(post).toContain('Coffee at the plaza after.')
    // none of TigerWolves' branding leaks in
    expect(post).not.toContain('TigerWolves')
    expect(post).not.toContain('Da Bins')
    expect(post).not.toContain('Run Leaders:')
    expect(post).not.toContain('NYC Marathon')
  })

  test('omits the WORKOUT section for a non-workout (Easy) kind, even with no selections', () => {
    const post = buildPost(entry, [], mourningDovesConfig, mourningDovesRoster)
    // no structured workout block or type: name / reason lines
    expect(post).not.toContain('WORKOUT')
    expect(post).not.toContain('Ladder: Tempo Ladder')
    expect(post).not.toContain('Build lactate threshold')
    // the run's non-workout content is all still present
    expect(post).toContain('🕊️ Mourning Doves Wednesday Run')
    expect(post).toContain(`📅 ${formatDateLong(entry.date)}`)
    expect(post).toContain('📍 Prospect Park — Grand Army Plaza entrance')
    expect(post).toContain('Coffee at the plaza after.')
    expect(post).toContain('Led by Lou')
    expect(post).toContain('Your Mourning Doves leaders: Priya, Sam')
  })

  test('does not throw when a non-workout run has empty selections', () => {
    expect(() => buildPost(entry, [], mourningDovesConfig, mourningDovesRoster)).not.toThrow()
  })

  test('TigerWolves output matches pre-parameterization snapshot', () => {
    // Run this test against the OLD buildPost first to create the snapshot,
    // then update buildPost signature — the snapshot must still match.
    // On first run: vitest creates __tests__/__snapshots__/postBuilder.test.ts.snap
    const post = buildPost(entry, [baseWorkout], tigerWolvesConfig, tigerWolvesRoster)
    expect(post).toMatchSnapshot()
  })
})

describe('buildVerificationLabel', () => {
  test('quality workout returns intervals-focused label', () => {
    const label = buildVerificationLabel({ ...baseWorkout, type: 'Ladder', rawInput: 'WU: 15min. Main: 3×1K @ 3K pace, 90s rest. CD: 10min.', distTime: '~5mi' })
    expect(label).toContain('3×1K')
    expect(label).toContain('90s rest')
    expect(label).toContain('~5mi')
  })

  test('route workout returns route-focused label', () => {
    const routeWorkout = { ...baseWorkout, type: 'Route', name: 'Kent Ave Loop', distTime: '~6mi' }
    const label = buildVerificationLabel(routeWorkout)
    expect(label).toContain('Kent Ave Loop')
    expect(label).toContain('~6mi')
  })

  test('fallback label when no useful fields', () => {
    const minimal = { ...baseWorkout, rawInput: '', distTime: '', type: 'Easy' }
    const label = buildVerificationLabel(minimal)
    expect(label).toBeTruthy()
    expect(label.length).toBeGreaterThan(5)
  })
})
