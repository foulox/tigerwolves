import { describe, it, expect } from 'vitest'
import { DAYS_OF_WEEK, validateRunIdentity } from '@/lib/runIdentity'

describe('DAYS_OF_WEEK', () => {
  it('has 7 entries with Monday first', () => {
    expect(DAYS_OF_WEEK.length).toBe(7)
    expect(DAYS_OF_WEEK[0]).toBe('Monday')
  })
})

describe('validateRunIdentity', () => {
  const validIdentity = {
    name: 'TigerWolves',
    dayOfWeek: 'Tuesday',
    emoji: '🐯',
    meetingTime: '6:45 AM',
    meetingLocation: 'Prospect Park',
    description: 'Quality workout',
    warmupDescription: 'Dynamic stretches',
  }

  it('returns {} for a fully valid identity', () => {
    const result = validateRunIdentity(validIdentity)
    expect(result).toEqual({})
  })

  it("returns { error: 'Name is required' } when name is empty", () => {
    const result = validateRunIdentity({ ...validIdentity, name: '' })
    expect(result).toEqual({ error: 'Name is required' })
  })

  it("returns { error: 'Name is required' } when name is whitespace only", () => {
    const result = validateRunIdentity({ ...validIdentity, name: '   ' })
    expect(result).toEqual({ error: 'Name is required' })
  })

  it("returns { error: 'Invalid day' } when dayOfWeek is not in DAYS_OF_WEEK", () => {
    const result = validateRunIdentity({ ...validIdentity, dayOfWeek: 'NotADay' })
    expect(result).toEqual({ error: 'Invalid day' })
  })

  it('accepts all days in DAYS_OF_WEEK', () => {
    for (const day of DAYS_OF_WEEK) {
      const result = validateRunIdentity({ ...validIdentity, dayOfWeek: day })
      expect(result).toEqual({})
    }
  })

  it('allows free text for emoji, meetingTime, meetingLocation, description, warmupDescription', () => {
    const result = validateRunIdentity({
      name: 'Test Run',
      dayOfWeek: 'Monday',
      emoji: 'anything goes here!',
      meetingTime: 'whenever',
      meetingLocation: '',
      description: '123',
      warmupDescription: 'null',
    })
    expect(result).toEqual({})
  })
})
