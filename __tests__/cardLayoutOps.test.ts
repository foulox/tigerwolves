// __tests__/cardLayoutOps.test.ts
import { test, expect } from 'vitest'
import { normalizeTemplate, moveToField, setAlign, moveRow, mergeRowUp, splitToNewRow, CARD_FIELD_LABELS } from '../lib/cardLayoutOps'
import type { CardTemplate } from '../lib/data'

const base: CardTemplate = {
  version: 1,
  upfront: [{ fields: [{ key: 'distance', align: 'left' }, { key: 'mapLink', align: 'right' }] },
            { fields: [{ key: 'raceTypes', align: 'left' }] }],
  expanded: [{ fields: [{ key: 'reason', align: 'left' }] }],
  hidden: ['author'],
}
const keysOf = (rows: CardTemplate['upfront']) => rows.map(r => r.fields.map(f => f.key))

test('normalizeTemplate(null) → default, every field present once', () => {
  const t = normalizeTemplate(null)
  const all = [...t.upfront, ...t.expanded].flatMap(r => r.fields.map(f => f.key)).concat(t.hidden)
  expect(new Set(all).size).toBe(15)       // all CardFieldKeys, no dupes
})
test('normalizeTemplate appends a missing field to hidden', () => {
  const stripped: CardTemplate = { version:1, upfront:[], expanded:[], hidden:[] }
  const result = normalizeTemplate(stripped)
  const allKeys = Object.keys(CARD_FIELD_LABELS)
  expect(result.hidden.length).toBe(15)
  expect(new Set(result.hidden)).toEqual(new Set(allKeys))
})
test('moveToField to hidden removes from rows and adds to hidden', () => {
  const t = moveToField(base, 'mapLink', 'hidden')
  expect(keysOf(t.upfront)).toEqual([['distance'], ['raceTypes']])
  expect(t.hidden).toContain('mapLink')
})
test('moveToField to a section appends a new single-field row; align resets left', () => {
  const t = moveToField(base, 'author', 'expanded')   // was hidden
  expect(t.hidden).not.toContain('author')
  expect(t.expanded.at(-1)).toEqual({ fields: [{ key: 'author', align: 'left' }] })
})
test('setAlign changes only that field', () => {
  const t = setAlign(base, 'distance', 'right')
  expect(t.upfront[0].fields.find(f => f.key==='distance')!.align).toBe('right')
})
test('moveRow clamps at edges, swaps otherwise', () => {
  expect(moveRow(base, 'upfront', 0, 'up')).toEqual(base)        // no-op at top
  expect(keysOf(moveRow(base, 'upfront', 0, 'down').upfront)).toEqual([['raceTypes'], ['distance','mapLink']])
})
test('mergeRowUp merges into the row above; index 0 is a no-op', () => {
  expect(mergeRowUp(base, 'upfront', 0)).toEqual(base)
  expect(keysOf(mergeRowUp(base, 'upfront', 1).upfront)).toEqual([['distance','mapLink','raceTypes']])
})
test('splitToNewRow pulls a field into its own row just after', () => {
  const t = splitToNewRow(base, 'mapLink')
  expect(keysOf(t.upfront)).toEqual([['distance'], ['mapLink'], ['raceTypes']])
})
test('moveRow clamps at bottom edge (no-op)', () => {
  // base.upfront has 2 rows; last index is 1
  expect(moveRow(base, 'upfront', 1, 'down')).toEqual(base)
})
test('splitToNewRow on already-isolated field is a no-op', () => {
  // raceTypes occupies its own row in base.upfront — splitting it must not shift it
  expect(splitToNewRow(base, 'raceTypes')).toEqual(base)
})
test('ops never mutate the input', () => {
  const snapshot = JSON.parse(JSON.stringify(base))
  moveToField(base, 'distance', 'hidden'); setAlign(base,'distance','right'); mergeRowUp(base,'upfront',1)
  expect(base).toEqual(snapshot)
})
