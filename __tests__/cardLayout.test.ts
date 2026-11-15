import { describe, test, expect } from 'vitest'
import { hasValue, resolveCardLayout, parseCardTemplate, templateForGroup } from '../lib/cardLayout'
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
    expect(hasValue({ ...full, lastRan: null }, 'lastRan')).toBe(true)
    expect(hasValue({ ...full, author: null }, 'author')).toBe(false)
    expect(hasValue({ ...full, raceTypes: [] }, 'raceTypes')).toBe(false)
    expect(hasValue({ ...full, distanceMiles: null, elevationGainFeet: null, distTime: '' }, 'distance')).toBe(false)
    expect(hasValue({ ...full, coachingNotes: null }, 'coachingNotes')).toBe(false)
    expect(hasValue({ ...full, rawInput: '' }, 'description')).toBe(false)
    expect(hasValue({ ...full, hasTurnaround: false }, 'turnaround')).toBe(false)
  })

  test('distance field present when only distTime/elevation set (distTime-only parity)', () => {
    expect(hasValue({ ...full, distanceMiles: null, elevationGainFeet: null }, 'distance')).toBe(true)   // distTime alone
    expect(hasValue({ ...full, distanceMiles: null, distTime: '' }, 'distance')).toBe(true)   // elevation alone
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

describe('parseCardTemplate', () => {
  test('null / undefined → null', () => {
    expect(parseCardTemplate(null)).toBeNull()
    expect(parseCardTemplate(undefined)).toBeNull()
  })
  test('valid template round-trips', () => {
    const t = { version: 1, upfront: [{ fields: [{ key: 'distance', align: 'left' }] }], expanded: [], hidden: [] }
    expect(parseCardTemplate(t)).toEqual(t)
  })
  test('wrong/old version → null (fall back to default)', () => {
    expect(parseCardTemplate({ version: 2, upfront: [], expanded: [], hidden: [] })).toBeNull()
  })
  test('malformed shape → null, never throws', () => {
    expect(parseCardTemplate('{}')).toBeNull()
    expect(parseCardTemplate({ version: 1 })).toBeNull()               // missing arrays
    expect(parseCardTemplate({ version: 1, upfront: 'x', expanded: [], hidden: [] })).toBeNull()
  })
})

describe('templateForGroup (#543 — resolve by the route\'s home run)', () => {
  const showsMap: CardTemplate = { version: 1, upfront: [{ fields: [{ key: 'mapLink', align: 'right' }] }], expanded: [], hidden: [] }
  const hidesMap: CardTemplate = { version: 1, upfront: [{ fields: [{ key: 'description', align: 'left' }] }], expanded: [], hidden: [] }

  test('returns the home run\'s template for a known run_group', () => {
    const map: Record<number, CardTemplate | null> = { 5: showsMap, 1: hidesMap }
    expect(templateForGroup(5, map)).toBe(showsMap)
    expect(templateForGroup(1, map)).toBe(hidesMap)
  })

  test('unknown run_group or null id → null (resolver falls back to default)', () => {
    expect(templateForGroup(99, { 5: showsMap })).toBeNull()
    expect(templateForGroup(null, { 5: showsMap })).toBeNull()
  })

  test('a group explicitly mapped to null → null (default), not an error', () => {
    expect(templateForGroup(5, { 5: null })).toBeNull()
  })
})

describe('library renders each route by its home run, not the viewer (#543)', () => {
  const flat = (r: ReturnType<typeof resolveCardLayout>) =>
    [...r.upfront, ...r.expanded].flatMap(row => [...row.left, ...row.right].map(f => f.key))

  // A workout run (e.g. TigerWolves) whose template omits route fields.
  const workoutRunTemplate: CardTemplate = {
    version: 1,
    upfront: [{ fields: [{ key: 'description', align: 'left' }] }], // no mapLink / routeNarrative
    expanded: [],
    hidden: ['mapLink', 'routeNarrative', 'mapImage', 'distance'],
  }

  test('a route whose home run hides route fields does not render them, even for a different viewer', () => {
    const route = { ...full, runGroupId: 1, mapLink: 'http://map', routeNarrative: 'turn left' }
    const byGroup: Record<number, CardTemplate | null> = { 1: workoutRunTemplate }
    const keys = flat(resolveCardLayout(route, templateForGroup(route.runGroupId, byGroup)))
    expect(keys).not.toContain('mapLink')
    expect(keys).not.toContain('routeNarrative')
  })

  test('a route whose home run has no template falls back to default → map + turn-by-turn show', () => {
    const route = { ...full, runGroupId: 5, mapLink: 'http://map', routeNarrative: 'turn left' }
    const byGroup: Record<number, CardTemplate | null> = { 5: null } // e.g. Narwhals (null card_template)
    const keys = flat(resolveCardLayout(route, templateForGroup(route.runGroupId, byGroup)))
    expect(keys).toContain('mapLink')
    expect(keys).toContain('routeNarrative')
  })
})
