// __tests__/bottomNavShell.test.ts
import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
const src = readFileSync(path.resolve(__dirname, '../components/BottomNav.tsx'), 'utf8')

describe('NBR dark bottom nav (#510 v2 reskin)', () => {
  test('nav bar uses dark chrome', () => {
    expect(src).toContain('bg-chrome')
  })
  test('active tab is white with a white top rule, not red/orange', () => {
    // v2: active reads white (label + icon) with a 2px white top-rule indicator;
    // the deprecated red accent token is gone from the nav.
    expect(src).toContain('text-white')
    expect(src).toContain('bg-white') // the 2px active top-rule span
    expect(src).not.toContain('text-accent')
    expect(src).not.toContain('text-orange-500')
  })
  test('leader-only Schedule gating is unchanged', () => {
    expect(src).toContain('leaderOnly')
    expect(src).toContain("t.leaderOnly || isLeader")
  })
})
