import { describe, test, expect } from 'vitest'
import { hasValue, resolveCardLayout, DEFAULT_CARD_TEMPLATE } from '../lib/cardLayout'
import type { WorkoutVariantRow, CardTemplate } from '../lib/data'

// Minimal fixture with every placeable value PRESENT; override per test.
const full: WorkoutVariantRow = {
  id: 1, familyId: 1, name: 'Domino Park Loop', label: null, sortOrder: null,
  category: 'Quality', type: 'Broken Tempo' as WorkoutVariantRow['type'],
  reason: 'why', rawInput: '800m loops', distTime: '800m', energySystem: 'VO2',
  hrZone: 'Z4', rpe: '8', coachingNotes: 'stay honest', mapLink: 'http://map',
  distanceMiles: 4, elevationGainFeet: 520, geometry: null,
  mapImageUrl: 'http://img', routeNarrative: 'turn left', author: 'Sal',
  raceTypes: ['5K'], trainingPhases: ['Build'], hasTurnaround: true,
  turnaround: 'after rep 2', flagged: false, flagNote: '', runGroupId: 1,
  lastRan: '2026-09-30',
}

describe('hasValue', () => {
  test('present fields report true', () => {
    for (const k of ['description','coachingNotes','distance','lastRan','mapLink',
      'mapImage','routeNarrative','reason','energySystem','hrZone','rpe',
      'turnaround','raceTypes','trainingPhases','author'] as const) {
      expect(hasValue(full, k)).toBe(true)
    }
  })
  test('empty/absent values report false', () => {
    expect(hasValue({ ...full, mapImageUrl: null }, 'mapImage')).toBe(false)
    expect(hasValue({ ...full, lastRan: null }, 'lastRan')).toBe(false)
    expect(hasValue({ ...full, author: null }, 'author')).toBe(false)
    expect(hasValue({ ...full, raceTypes: [] }, 'raceTypes')).toBe(false)
    expect(hasValue({ ...full, distanceMiles: null }, 'distance')).toBe(false)
    expect(hasValue({ ...full, coachingNotes: null }, 'coachingNotes')).toBe(false)
    expect(hasValue({ ...full, rawInput: '' }, 'description')).toBe(false)
    expect(hasValue({ ...full, hasTurnaround: false }, 'turnaround')).toBe(false)
  })
})

describe('resolveCardLayout', () => {
  const flatKeys = (rows: { left: {key:string}[]; right: {key:string}[] }[]) =>
    rows.flatMap(r => [...r.left, ...r.right].map(f => f.key))

  test('null layout uses the default (map link upfront, per #411)', () => {
    const r = resolveCardLayout(full, null)
    expect(flatKeys(r.upfront)).toContain('mapLink')
    expect(flatKeys(r.upfront)).toContain('distance')
    expect(flatKeys(r.expanded)).toContain('reason')
  })

  test('empty-value fields are skipped and empty rows dropped', () => {
    const noMapImg = { ...full, mapImageUrl: null }
    const layout: CardTemplate = {
      version: 1,
      upfront: [{ fields: [{ key: 'mapImage', align: 'left' }] },
                { fields: [{ key: 'distance', align: 'left' }] }],
      expanded: [], hidden: [],
    }
    const r = resolveCardLayout(noMapImg, layout)
    expect(flatKeys(r.upfront)).toEqual(['distance'])       // mapImage row dropped
  })

  test('left/right alignment routes fields into the right group', () => {
    const layout: CardTemplate = {
      version: 1,
      upfront: [{ fields: [{ key: 'distance', align: 'left' },
                           { key: 'mapLink', align: 'right' }] }],
      expanded: [], hidden: [],
    }
    const r = resolveCardLayout(full, layout)
    expect(r.upfront[0].left.map(f => f.key)).toEqual(['distance'])
    expect(r.upfront[0].right.map(f => f.key)).toEqual(['mapLink'])
  })

  test('unknown key in a saved layout is ignored (no throw)', () => {
    const layout = { version: 1, upfront: [{ fields: [
      { key: 'bogus', align: 'left' }, { key: 'distance', align: 'left' }] }],
      expanded: [], hidden: [] } as unknown as CardTemplate
    const r = resolveCardLayout(full, layout)
    expect(flatKeys(r.upfront)).toEqual(['distance'])
  })

  test('present field unlisted in a saved layout is NOT auto-surfaced', () => {
    const layout: CardTemplate = {
      version: 1,
      upfront: [{ fields: [{ key: 'distance', align: 'left' }] }],
      expanded: [], hidden: [],
    }
    const r = resolveCardLayout(full, layout) // author present but unlisted
    expect([...flatKeys(r.upfront), ...flatKeys(r.expanded)]).not.toContain('author')
  })

  test('compound distance travels as a single placement', () => {
    // AC coverage: a layout with a single distance placement should resolve to
    // exactly one field with key 'distance' — not split into miles/elevation/dist-time.
    const layout: CardTemplate = {
      version: 1,
      upfront: [{ fields: [{ key: 'distance', align: 'left' }] }],
      expanded: [], hidden: [],
    }
    const r = resolveCardLayout(full, layout)
    const keys = flatKeys(r.upfront)
    expect(keys.filter(k => k === 'distance')).toHaveLength(1)
  })
})
