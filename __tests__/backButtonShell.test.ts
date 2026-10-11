import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
const src = readFileSync(path.resolve(__dirname, '../components/BackButton.tsx'), 'utf8')

describe('BackButton (#513)', () => {
  test('is a client component that calls router.back()', () => {
    expect(src).toContain("'use client'")
    expect(src).toContain('router.back()')
  })
  test('has an accessible label', () => {
    expect(src).toContain('aria-label="Go back"')
  })
})
