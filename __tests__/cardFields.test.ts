import { describe, test, expect } from 'vitest'
import { describeField } from '../lib/cardFields'
import type { WorkoutVariantRow } from '../lib/data'

// Same fixture as cardLayout.test.ts — every placeable field present.
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

describe('describeField', () => {
  test('description → body text from rawInput', () => {
    expect(describeField(full, 'description')).toEqual({ kind: 'text', text: '800m loops', variant: 'body' })
  })

  test('coachingNotes → coaching text', () => {
    expect(describeField(full, 'coachingNotes')).toEqual({ kind: 'text', text: 'stay honest', variant: 'coaching' })
  })

  test('distance → inline parts (miles · elev · distTime)', () => {
    expect(describeField({ ...full, distTime: '' }, 'distance'))
      .toEqual({ kind: 'inline', parts: ['4.0 mi', '520 ft ↑'] })
  })

  test('distance → inline parts with distTime included when present', () => {
    expect(describeField(full, 'distance'))
      .toEqual({ kind: 'inline', parts: ['4.0 mi', '520 ft ↑', '800m'] })
  })

  test('distance → distTime alone (parity for distTime-only data)', () => {
    expect(describeField({ ...full, distanceMiles: null, elevationGainFeet: null }, 'distance'))
      .toEqual({ kind: 'inline', parts: ['800m'] })
  })

  test('lastRan present → "Last ran …"; null → "Never used"', () => {
    expect(describeField(full, 'lastRan')).toEqual({ kind: 'text-inline', text: 'Last ran Sep 30' })
    expect(describeField({ ...full, lastRan: null }, 'lastRan')).toEqual({ kind: 'text-inline', text: 'Never used' })
  })

  test('mapLink → link; mapImage → image', () => {
    expect(describeField(full, 'mapLink')).toEqual({ kind: 'link', href: 'http://map', label: 'Map ↗' })
    expect(describeField(full, 'mapImage')).toEqual({ kind: 'image', src: 'http://img' })
  })

  test('raceTypes/trainingPhases → pills', () => {
    expect(describeField(full, 'raceTypes')).toEqual({ kind: 'pills', variant: 'race', items: ['5K'] })
    expect(describeField(full, 'trainingPhases')).toEqual({ kind: 'pills', variant: 'phase', items: ['Build'] })
  })

  test('detail fields → label+value', () => {
    expect(describeField(full, 'reason')).toEqual({ kind: 'detail', label: 'Reason', value: 'why' })
    expect(describeField(full, 'energySystem')).toEqual({ kind: 'detail', label: 'Energy System', value: 'VO2' })
    expect(describeField(full, 'hrZone')).toEqual({ kind: 'detail', label: 'HR Zone', value: 'Z4' })
    expect(describeField(full, 'rpe')).toEqual({ kind: 'detail', label: 'RPE', value: '8' })
    expect(describeField(full, 'turnaround')).toEqual({ kind: 'detail', label: 'Turnaround', value: 'after rep 2' })
  })

  test('routeNarrative → route block kind', () => {
    expect(describeField(full, 'routeNarrative')).toEqual({ kind: 'route', text: 'turn left' })
  })

  test('distance → null when all distance fields absent', () => {
    expect(describeField({ ...full, distanceMiles: null, elevationGainFeet: null, distTime: '' }, 'distance')).toBeNull()
  })

  test('turnaround → null when hasTurnaround is false', () => {
    expect(describeField({ ...full, hasTurnaround: false }, 'turnaround')).toBeNull()
  })

  test('author → author kind', () => {
    expect(describeField(full, 'author')).toEqual({ kind: 'author', text: 'Sal' })
  })

  test('null values return null (defensive)', () => {
    expect(describeField({ ...full, mapLink: null }, 'mapLink')).toBeNull()
    expect(describeField({ ...full, mapImageUrl: null }, 'mapImage')).toBeNull()
    expect(describeField({ ...full, author: null }, 'author')).toBeNull()
    expect(describeField({ ...full, coachingNotes: null }, 'coachingNotes')).toBeNull()
  })
})
