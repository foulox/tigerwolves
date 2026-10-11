// __tests__/headerControlsShell.test.ts
import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
const src = readFileSync(path.resolve(__dirname, '../components/HeaderControls.tsx'), 'utf8')

describe('HeaderControls (#513)', () => {
  test('is a client component', () => {
    expect(src).toContain("'use client'")
  })
  test('retains the signed-in flash guard (isLoaded)', () => {
    expect(src).toContain('isLoaded')
  })
  test('renders the Clerk UserButton with both leader links', () => {
    expect(src).toContain('UserButton')
    expect(src).toContain('Run Settings')
    expect(src).toContain('Edit Workouts')
  })
  test('renders the signed-out sign-in link and the FeedbackButton', () => {
    expect(src).toContain('/sign-in')
    expect(src).toContain('FeedbackButton')
  })
  test('gates the leader links behind isLeader', () => {
    expect(src).toContain('isLeader')
  })
})
