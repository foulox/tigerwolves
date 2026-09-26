import { describe, test, expect } from 'vitest'
import { parseTemplate, serializeTokens, buildInsertMenu, domNodesToTokens } from '../lib/postTemplateTokens'
import type { WalkNode } from '../lib/postTemplateTokens'
import { POST_FIELDS, defaultTemplate } from '../lib/postBuilder'
import type { RunConfig } from '../lib/data'

const validKeys = new Set(POST_FIELDS.map(f => f.key))

// Copied verbatim from __tests__/postBuilder.test.ts — RunConfig requires postTemplate field.
const tigerWolvesConfig: RunConfig = {
  id: 'tuesday-morning-tigerwolves',
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

// -------------------------------------------------------------------------
// domNodesToTokens — the editor's DOM → token read-back, extracted here so the
// walk (which has regressed on newline handling more than once) is unit-tested
// without a real DOM. Fake nodes model the structural WalkNode shape.
// -------------------------------------------------------------------------

const txt = (value: string): WalkNode => ({ nodeType: 3, nodeName: '#text', textContent: value, childNodes: [] })
const br = (): WalkNode => ({ nodeType: 1, nodeName: 'BR', textContent: null, childNodes: [] })
const div = (...childNodes: WalkNode[]): WalkNode => ({ nodeType: 1, nodeName: 'DIV', textContent: null, childNodes })
const span = (...childNodes: WalkNode[]): WalkNode => ({ nodeType: 1, nodeName: 'SPAN', textContent: null, childNodes })
// A chip is a SPAN carrying data-key, with a label + ✕ button inside it.
const chip = (key: string, ...childNodes: WalkNode[]): WalkNode => ({ nodeType: 1, nodeName: 'SPAN', textContent: null, childNodes, dataset: { key } })

const ser = (nodes: WalkNode[]) => serializeTokens(domNodesToTokens(nodes))

describe('domNodesToTokens', () => {
  test('two block lines → single newline between', () => {
    expect(ser([div(txt('A')), div(txt('B'))])).toBe('A\nB')
  })

  test('empty <div><br></div> between blocks → blank line preserved (regression #393)', () => {
    // The bug: a filler <br> was suppressed and the next block boundary deduped
    // away, collapsing "A\n\nB" (blank separator line) to "A\nB".
    expect(ser([div(txt('A')), div(br()), div(txt('B'))])).toBe('A\n\nB')
  })

  test('two empty lines between blocks → two blank lines', () => {
    expect(ser([div(txt('A')), div(br()), div(br()), div(txt('B'))])).toBe('A\n\n\nB')
  })

  test('soft <br> between inline text', () => {
    expect(ser([txt('a'), br(), txt('b')])).toBe('a\nb')
  })

  test('<br> immediately followed by a block does not double the newline', () => {
    expect(ser([txt('a'), br(), div(txt('b'))])).toBe('a\nb')
  })

  test('trailing filler <br> in a block, then another block → no double newline', () => {
    expect(ser([div(txt('x'), br()), div(txt('y'))])).toBe('x\ny')
  })

  test('soft <br> inside a single block', () => {
    expect(ser([div(txt('x'), br(), txt('y'))])).toBe('x\ny')
  })

  test('flat (unedited seed) text node round-trips verbatim, blank lines intact', () => {
    expect(ser([txt('line1\n\nline2')])).toBe('line1\n\nline2')
  })

  test('inline <span> wrapper is descended into with no block boundary', () => {
    expect(ser([div(txt('a'), span(txt('b')), txt('c'))])).toBe('abc')
  })

  test('chip → chip token; inner label/✕ never leak into text', () => {
    const nodes = [div(txt('Led by '), chip('day_leader', txt('Day leader'), txt('✕')))]
    const tokens = domNodesToTokens(nodes)
    expect(tokens).toEqual([
      { type: 'text', value: 'Led by ' },
      { type: 'chip', key: 'day_leader' },
    ])
    expect(serializeTokens(tokens)).toBe('Led by {{day_leader}}')
  })

  test('DOM read-back equals parseTemplate for a canonical chip template', () => {
    const tmpl = 'Hi {{leaders}} bye'
    // As the editor holds it after seeding: flat text + an atomic chip span.
    const nodes = [txt('Hi '), chip('leaders', txt('Leaders'), txt('✕')), txt(' bye')]
    expect(serializeTokens(domNodesToTokens(nodes))).toBe(tmpl)
    expect(domNodesToTokens(nodes)).toEqual(parseTemplate(tmpl, validKeys))
  })
})
