// __tests__/allRunsReskin.test.ts
import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
const src = readFileSync(path.resolve(__dirname, '../components/AllRunsClient.tsx'), 'utf8')

describe('All Runs reskin — chrome/surface/neutral/active (#488)', () => {
  test('uses NBR semantic utilities for structure', () => {
    expect(src).toContain('bg-card')
    expect(src).toContain('border-line')
    expect(src).toContain('text-ink')
    expect(src).toContain('text-muted')
  })
  test('primary actions + active states use accent', () => {
    expect(src).toContain('bg-accent')
    expect(src).toContain('border-accent')
    expect(src).toContain('text-accent')
  })
  test('the recolored neutral/chrome literals are gone', () => {
    for (const dead of ['#fff7ed', '#fdba74', '#ffedd5', '#c2410c', '#111827', '#8b93a1', '#4b5568', '#a7adb8', '#c7ccd6', '#f1f2f5', '#e8eaef', '#d7dbe3', 'bg-orange-500', 'text-gray-400']) {
      expect(src).not.toContain(dead)
    }
  })
  test('semantic STATE colors are preserved', () => {
    expect(src).toContain('bg-green-100') // Live / following-section affordance
    expect(src).toContain('bg-amber-100') // Draft
    expect(src).toContain('bg-red-50')    // destructive Remove
    expect(src).toContain('bg-blue-50')   // pending Setup
  })
})

describe('All Runs reskin — color-coding collapsed (#488)', () => {
  test('AM/PM start-time colors are gone (uniform time color)', () => {
    expect(src).not.toContain('#f97316') // AM orange
    expect(src).not.toContain('#6366f1') // PM indigo
  })
  test('per-category pill colors collapsed to one neutral style', () => {
    // the CATEGORY_PILL map no longer carries per-category Tailwind color pairs
    for (const dead of ['bg-sky-100', 'text-sky-800', 'bg-purple-100', 'text-purple-800', 'bg-blue-100 text-blue-800']) {
      expect(src).not.toContain(dead)
    }
  })
})
