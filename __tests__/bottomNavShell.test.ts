// __tests__/bottomNavShell.test.ts
import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
const src = readFileSync(path.resolve(__dirname, '../components/BottomNav.tsx'), 'utf8')

describe('NBR dark bottom nav (#466)', () => {
  test('nav uses dark chrome, not white', () => {
    expect(src).toContain('bg-chrome')
    expect(src).not.toContain('bg-white')
  })
  test('active tab uses the accent token, not orange', () => {
    expect(src).toContain('text-accent')
    expect(src).not.toContain('text-orange-500')
  })
  test('leader-only Schedule gating is unchanged', () => {
    expect(src).toContain('leaderOnly')
    expect(src).toContain("t.leaderOnly || isLeader")
  })
})
