import { describe, it, expect } from 'vitest'
import { parseRoadmap } from '../lib/roadmap'

describe('parseRoadmap', () => {
  it('returns empty array for empty input', () => {
    expect(parseRoadmap('')).toEqual([])
    expect(parseRoadmap('   ')).toEqual([])
  })

  it('parses well-formed markdown into typed cards', () => {
    const md = `
## [live] Now — TigerWolves Participants
You can see the upcoming schedule and react to workouts.

## [upcoming] Next — A Second NBR Run
Bring the app to a second NBR run.

## [vision] Horizon
Longer term: more running clubs.
`.trim()

    expect(parseRoadmap(md)).toEqual([
      {
        status: 'live',
        title: 'Now — TigerWolves Participants',
        description: 'You can see the upcoming schedule and react to workouts.',
      },
      {
        status: 'upcoming',
        title: 'Next — A Second NBR Run',
        description: 'Bring the app to a second NBR run.',
      },
      {
        status: 'vision',
        title: 'Horizon',
        description: 'Longer term: more running clubs.',
      },
    ])
  })

  it('defaults to upcoming for unknown status tag', () => {
    const md = `## [beta] Some Feature\nDescription here.`
    const cards = parseRoadmap(md)
    expect(cards[0].status).toBe('upcoming')
    expect(cards[0].title).toBe('Some Feature')
  })

  it('defaults to upcoming for missing status tag', () => {
    const md = `## No Tag Here\nJust a description.`
    const cards = parseRoadmap(md)
    expect(cards[0].status).toBe('upcoming')
    expect(cards[0].title).toBe('No Tag Here')
  })

  it('ignores intro text before the first heading', () => {
    const md = `This is an intro paragraph.\n\n## [live] Current\nWe are here.`
    const cards = parseRoadmap(md)
    expect(cards).toHaveLength(1)
    expect(cards[0].title).toBe('Current')
  })

  it('handles multi-paragraph descriptions', () => {
    const md = `## [upcoming] Big Feature\nFirst paragraph.\n\nSecond paragraph.`
    const cards = parseRoadmap(md)
    expect(cards[0].description).toBe('First paragraph.\n\nSecond paragraph.')
  })

  it('stops at --- so developer content below does not bleed into descriptions', () => {
    const md = `## [vision] Horizon\nLonger term goals.\n\n---\n\n### Shipped\n#### Sprint 1\nAll the details.`
    const cards = parseRoadmap(md)
    expect(cards).toHaveLength(1)
    expect(cards[0].description).toBe('Longer term goals.')
  })
})
