import { describe, test, expect } from 'vitest'
import { parseTemplate, serializeTokens, buildInsertMenu } from '../lib/postTemplateTokens'
import { POST_FIELDS, defaultTemplate } from '../lib/postBuilder'
import type { RunConfig } from '../lib/data'

const validKeys = new Set(POST_FIELDS.map(f => f.key))

// Copied verbatim from __tests__/postBuilder.test.ts — RunConfig requires postTemplate field.
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
  postHeader: [
    '🐯🐺 TigerWolves Tuesday Workout',
    '',
    '👉 https://tigerwolves.foulox.me 👈',
    '👀 See every workout between now and the NYC Marathon in the app',
    "🗳️ React to let us know what you like — and what you don't",
  ].join('\n'),
  leaderIntro: 'Run Leaders:',
  closingNotes: 'Bag Drop: Sorry, Not available',
  kind: 'Workout',
  workoutTypes: ['Hills', 'Broken Tempo', 'Progression', 'Ladder', 'Superset', 'Straight Tempo', 'Threshold'],
  runGroupId: 1,
  cycleMode: 'none',
  cycle: {},
  status: 'live',
  postTemplate: null,
}

describe('postTemplateTokens', () => {
  test('round-trip stability: hand-written template and defaultTemplate(tigerWolvesConfig)', () => {
    // Hand-written template with prose + several chips
    const handWritten = 'Hi\n{{date}}\n{{workout_name}} — {{leaders}}\nbye'
    expect(serializeTokens(parseTemplate(handWritten, validKeys))).toBe(handWritten)

    // defaultTemplate round-trip (canonical chips, no inner spaces)
    const defaultTmpl = defaultTemplate(tigerWolvesConfig)
    expect(serializeTokens(parseTemplate(defaultTmpl, validKeys))).toBe(defaultTmpl)
  })

  test('known vs unknown key: known → chip, unknown → literal text', () => {
    const tokens = parseTemplate('{{location}} then {{bogus}}', validKeys)

    // {{location}} is a known key → chip
    const locationChip = tokens.find(t => t.type === 'chip' && t.key === 'location')
    expect(locationChip).toBeDefined()

    // {{bogus}} is unknown → kept as literal text, no chip with key 'bogus'
    const bogusChip = tokens.find(t => t.type === 'chip' && (t as { key: string }).key === 'bogus')
    expect(bogusChip).toBeUndefined()

    // The raw literal text for {{bogus}} is preserved
    const bogusText = tokens.find(t => t.type === 'text' && t.value === '{{bogus}}')
    expect(bogusText).toBeDefined()
  })

  test('full catalog: buildInsertMenu covers every POST_FIELDS key, no duplicates', () => {
    const groups = buildInsertMenu(POST_FIELDS)
    const allKeys = groups.flatMap(g => g.fields.map(f => f.key))
    const expectedKeys = POST_FIELDS.map(f => f.key)

    // Same set (no drops, no additions)
    expect(new Set(allKeys)).toEqual(new Set(expectedKeys))

    // No duplicates
    expect(allKeys.length).toBe(expectedKeys.length)
  })
})
