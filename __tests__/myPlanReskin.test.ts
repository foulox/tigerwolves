// __tests__/myPlanReskin.test.ts
import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
const read = (p: string) => readFileSync(path.resolve(__dirname, '..', p), 'utf8')
const cl = read('components/MyPlanClient.tsx'); const cd = read('components/MyPlanCard.tsx')
describe('My Plan reskin (#489)', () => {
  test('NBR tokens + accent present; no orange; type pills collapsed', () => {
    for (const t of ['bg-card', 'border-line', 'text-ink', 'text-muted', 'text-accent']) expect(cd).toContain(t)
    expect(cl).toContain('bg-accent') // today marker
    expect(cl).not.toMatch(/orange-\d/); expect(cd).not.toMatch(/orange-\d/)
    for (const dead of ['bg-green-100', 'bg-blue-100', 'bg-purple-100', 'bg-pink-100', 'bg-yellow-100']) expect(cd).not.toContain(dead)
  })
  test('flagged state stays red', () => { expect(cd).toContain('bg-red-100') })
})
