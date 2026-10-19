// __tests__/scheduleReskin.test.ts
import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
const read = (p: string) => readFileSync(path.resolve(__dirname, '..', p), 'utf8')
const sc = read('components/ScheduleClient.tsx')
const lp = read('components/LeaderPicker.tsx')
describe('Schedule reskin (#489)', () => {
  test('NBR tokens present', () => {
    // bg-accent / text-accent no longer appear inline — Model C (Task 3) routes
    // chip active states through filterChip (bg-ink) and the FilterSheet shared
    // component; the AC2 grep gate explicitly bans bg-accent from this file.
    for (const t of ['bg-card', 'bg-surface', 'border-line', 'text-ink', 'text-muted']) expect(sc).toContain(t)
  })
  test('no orange survives anywhere (brand → accent/neutral)', () => {
    expect(sc).not.toMatch(/orange-\d/)
    expect(lp).not.toMatch(/orange-\d/)
    expect(sc).not.toContain('bg-gray-900')
  })
  test('no stray yellow — the "Away" badge is on neutral tokens', () => {
    expect(lp).not.toMatch(/yellow-\d/)
  })
  test('state colors kept: red error + green save-success', () => {
    expect(sc).toContain('bg-red-50'); expect(sc).toContain('bg-green-500')
  })
})
