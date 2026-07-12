import { describe, it, expect } from 'vitest'
import { CURRENT_VERSION, WHATS_NEW } from '@/lib/whatsNew'

describe('whatsNew', () => {
  it('CURRENT_VERSION is 3', () => {
    expect(CURRENT_VERSION).toBe(3)
  })

  it('has exactly 7 version-2 items', () => {
    const v2 = WHATS_NEW.filter(item => item.version === 2)
    expect(v2).toHaveLength(7)
  })

  it('has exactly 1 version-3 item', () => {
    const v3 = WHATS_NEW.filter(item => item.version === 3)
    expect(v3).toHaveLength(1)
  })

  it('version-3 items cover the expected features', () => {
    const v3Titles = WHATS_NEW.filter(i => i.version === 3).map(i => i.title)
    expect(v3Titles).toContain('Flag a workout issue')
  })

  it('version-2 items cover the expected features', () => {
    const v2Titles = WHATS_NEW.filter(i => i.version === 2).map(i => i.title)
    expect(v2Titles).toContain('Emoji reactions')
    expect(v2Titles).toContain('Expandable workout details on Schedule')
    expect(v2Titles).toContain('Workout variations in the Library')
    expect(v2Titles).toContain('Feedback button')
    expect(v2Titles).toContain('Roadmap')
    expect(v2Titles).toContain('Library management')
    expect(v2Titles).toContain('Tour updated')
  })

  it('every item has a non-empty title and description', () => {
    for (const item of WHATS_NEW) {
      expect(item.title.length).toBeGreaterThan(0)
      expect(item.description.length).toBeGreaterThan(0)
    }
  })
})
