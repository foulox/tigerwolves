// __tests__/libraryReskin.test.ts
import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
const src = readFileSync(path.resolve(__dirname, '../components/LibraryClient.tsx'), 'utf8')
describe('Library reskin (#491)', () => {
  test('NBR tokens + accent-active present', () => {
    for (const t of ['bg-card', 'border-line', 'text-ink', 'text-muted', 'bg-accent', 'text-accent']) expect(src).toContain(t)
  })
  test('orange + gray-900 active + neutral-pill-collapse: dead classes gone', () => {
    for (const dead of ['bg-orange-500', 'bg-orange-100', 'text-orange-600', 'text-orange-500', 'focus:border-orange-400', 'bg-gray-900']) expect(src).not.toContain(dead)
  })
  test('workout card tokenized to bg-card + carries the stable testid', () => {
    expect(src).toContain('bg-card')
    expect(src).toContain('data-testid="workout-card"')
  })
})
