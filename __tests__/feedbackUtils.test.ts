import { describe, it, expect } from 'vitest'
import { feedbackLabel, feedbackTitle, feedbackBody } from '../lib/feedbackUtils'

describe('feedbackLabel', () => {
  it('maps bug to bug', () => expect(feedbackLabel('bug')).toBe('bug'))
  it('maps feature to enhancement', () => expect(feedbackLabel('feature')).toBe('enhancement'))
  it('maps workout-data to workout-data', () => expect(feedbackLabel('workout-data')).toBe('workout-data'))
  it('maps run-leader to run-leader-feedback', () => expect(feedbackLabel('run-leader')).toBe('run-leader-feedback'))
})

describe('feedbackTitle', () => {
  it('prefixes bug titles', () => {
    expect(feedbackTitle('bug', 'button broken')).toBe('Bug: button broken')
  })

  it('prefixes feature titles', () => {
    expect(feedbackTitle('feature', 'add dark mode')).toBe('Feature: add dark mode')
  })

  it('includes workout context for workout-data', () => {
    const title = feedbackTitle('workout-data', 'wrong distance', 'Ladder #3 (Hills) — Tue Jul 15')
    expect(title).toBe('Workout Data: Ladder #3 (Hills) — Tue Jul 15 — wrong distance')
  })

  it('falls back to description only for workout-data without context', () => {
    expect(feedbackTitle('workout-data', 'wrong distance')).toBe('Workout Data: wrong distance')
  })

  it('prefixes run-leader titles', () => {
    expect(feedbackTitle('run-leader', 'needs warmup details')).toBe('Run Leader Feedback: needs warmup details')
  })

  it('truncates to 80 chars with ellipsis', () => {
    const long = 'a'.repeat(100)
    const result = feedbackTitle('bug', long)
    expect(result.length).toBe(80)
    expect(result.endsWith('…')).toBe(true)
  })

  it('does not truncate titles under 80 chars', () => {
    const short = 'short description'
    const result = feedbackTitle('bug', short)
    expect(result).toBe('Bug: short description')
    expect(result.length).toBeLessThan(80)
  })
})

describe('feedbackBody', () => {
  it('includes submitter for plain types', () => {
    const body = feedbackBody('bug', 'button broken', 'Anonymous visitor')
    expect(body).toContain('Submitted by: Anonymous visitor')
    expect(body).toContain('button broken')
  })

  it('includes workout context block for workout-data', () => {
    const body = feedbackBody('workout-data', 'wrong distance', 'Lou fox (foulox@gmail.com)', 'Ladder #3 (Hills) — Tue Jul 15')
    expect(body).toContain('**Workout:** Ladder #3 (Hills) — Tue Jul 15')
    expect(body).toContain('**Notes:** wrong distance')
    expect(body).toContain('Submitted by: Lou fox (foulox@gmail.com)')
  })

  it('falls back to plain body for workout-data without context', () => {
    const body = feedbackBody('workout-data', 'wrong distance', 'Anonymous visitor')
    expect(body).toContain('Submitted by: Anonymous visitor')
    expect(body).not.toContain('**Workout:**')
  })
})
