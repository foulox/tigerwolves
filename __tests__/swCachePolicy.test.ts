import { describe, test, expect } from 'vitest'
import { classifyRoute } from '../lib/sw-cache-policy'

describe('classifyRoute (#465 Story B scope guard)', () => {
  test('the four public routes are stale-while-revalidate', () => {
    expect(classifyRoute('/all-runs')).toBe('stale-while-revalidate')
    expect(classifyRoute('/library')).toBe('stale-while-revalidate')
    expect(classifyRoute('/races')).toBe('stale-while-revalidate')
    expect(classifyRoute('/runs/tigerwolves')).toBe('stale-while-revalidate')
    expect(classifyRoute('/runs/mourning-doves')).toBe('stale-while-revalidate')
  })

  test('auth/write/api paths are network-only — never cached', () => {
    expect(classifyRoute('/schedule')).toBe('network-only')
    expect(classifyRoute('/my-plan')).toBe('network-only')
    expect(classifyRoute('/api/health')).toBe('network-only')
    expect(classifyRoute('/api/e2e-revalidate')).toBe('network-only')
  })

  test('unknown/home routes default to network-only (not cached)', () => {
    expect(classifyRoute('/')).toBe('network-only')
    expect(classifyRoute('/sign-in')).toBe('network-only')
    expect(classifyRoute('/runs')).toBe('network-only') // the index, not a slug
  })

  test('a path that merely starts with a cached-route name is not mis-cached', () => {
    expect(classifyRoute('/libraryish')).toBe('network-only')
    expect(classifyRoute('/all-runs-admin')).toBe('network-only')
  })
})
