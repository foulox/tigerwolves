import { describe, test, expect } from 'vitest'
import { shouldShowIntro } from '../lib/allRunsIntro'

describe('shouldShowIntro — All Runs intro box visibility', () => {
  test('anonymous user (not logged in) → show intro', () => {
    expect(shouldShowIntro(false, 0)).toBe(true)
  })

  test('signed-in user with no follows → show intro', () => {
    expect(shouldShowIntro(true, 0)).toBe(true)
  })

  test('signed-in user with 1 follow → hide intro', () => {
    expect(shouldShowIntro(true, 1)).toBe(false)
  })

  test('signed-in user with multiple follows → hide intro', () => {
    expect(shouldShowIntro(true, 5)).toBe(false)
  })
})
