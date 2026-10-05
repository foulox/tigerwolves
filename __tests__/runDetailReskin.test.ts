// __tests__/runDetailReskin.test.ts
import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
const read = (p: string) => readFileSync(path.resolve(__dirname, '..', p), 'utf8')
describe('run detail reskin (#491)', () => {
  test('follow toggle: join accent, joined/disabled neutral', () => {
    const s = read('components/RunFollowToggle.tsx')
    expect(s).toContain('bg-accent')
    for (const dead of ['bg-orange-500', 'bg-green-100', 'text-green-800']) expect(s).not.toContain(dead)
  })
  test('GroupRunCard: type pills collapsed, markers → accent', () => {
    const s = read('components/GroupRunCard.tsx')
    expect(s).toContain('text-accent'); expect(s).toContain('border-accent')
    for (const dead of ['bg-purple-100', 'bg-pink-100', 'border-orange-300', 'text-orange-500', 'text-orange-600', '#8b8f97', '#f8f8f9']) expect(s).not.toContain(dead)
  })
})
