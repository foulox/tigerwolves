import { describe, it, expect } from 'vitest'
import { VISITOR_STEPS, LEADER_STEPS } from '@/lib/tourSteps'

describe('tourSteps', () => {
  it('VISITOR_STEPS has 10 entries', () => {
    expect(VISITOR_STEPS).toHaveLength(10)
  })

  it('LEADER_STEPS has 3 entries', () => {
    expect(LEADER_STEPS).toHaveLength(3)
  })

  it('every visitor step has a non-empty title, description, and data-tour element selector', () => {
    for (const step of VISITOR_STEPS) {
      expect(step.popover?.title?.length).toBeGreaterThan(0)
      expect(step.popover?.description?.length).toBeGreaterThan(0)
      expect(step.element).toMatch(/^\[data-tour="[a-z-]+"\]$/)
    }
  })

  it('every leader step has a non-empty title, description, and data-tour element selector', () => {
    for (const step of LEADER_STEPS) {
      expect(step.popover?.title?.length).toBeGreaterThan(0)
      expect(step.popover?.description?.length).toBeGreaterThan(0)
      expect(step.element).toMatch(/^\[data-tour="[a-z-]+"\]$/)
    }
  })

  it('visitor steps cover the expected data-tour targets', () => {
    const elements = VISITOR_STEPS.map(s => s.element)
    expect(elements).toContain('[data-tour="schedule"]')
    expect(elements).toContain('[data-tour="schedule-detail"]')
    expect(elements).toContain('[data-tour="schedule-reactions"]')
    expect(elements).toContain('[data-tour="schedule-flag"]')
    expect(elements).toContain('[data-tour="library"]')
    expect(elements).toContain('[data-tour="library-variations"]')
    expect(elements).toContain('[data-tour="races"]')
    expect(elements).toContain('[data-tour="roadmap"]')
    expect(elements).toContain('[data-tour="feedback"]')
    expect(elements).toContain('[data-tour="how-to-use"]')
  })

  it('visitor step at index 1 targets schedule-detail (card expand trigger)', () => {
    expect(VISITOR_STEPS[1].element).toBe('[data-tour="schedule-detail"]')
  })

  it('visitor step at index 5 targets library-variations', () => {
    expect(VISITOR_STEPS[5].element).toBe('[data-tour="library-variations"]')
  })

  it('leader steps cover the expected data-tour targets', () => {
    const elements = LEADER_STEPS.map(s => s.element)
    expect(elements).toContain('[data-tour="plan"]')
    expect(elements).toContain('[data-tour="heylo-area"]')
    expect(elements).toContain('[data-tour="library-manage"]')
  })

  it('leader step at index 1 targets heylo-area (not heylo-copy)', () => {
    expect(LEADER_STEPS[1].element).toBe('[data-tour="heylo-area"]')
    expect(LEADER_STEPS[1].element).not.toBe('[data-tour="heylo-copy"]')
  })

  it('leader step at index 2 targets library-manage', () => {
    expect(LEADER_STEPS[2].element).toBe('[data-tour="library-manage"]')
  })

  it('Heylo Post step description contains the turnaround warning', () => {
    const heyloStep = LEADER_STEPS.find(s => s.element === '[data-tour="heylo-area"]')
    expect(heyloStep?.popover?.description).toMatch(/turnaround/i)
  })
})
