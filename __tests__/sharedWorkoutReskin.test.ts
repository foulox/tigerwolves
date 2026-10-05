// __tests__/sharedWorkoutReskin.test.ts
import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
const read = (p: string) => readFileSync(path.resolve(__dirname, '..', p), 'utf8')

describe('shared workout sub-components reskin (#491)', () => {
  test('phase pills collapsed to the neutral pill (no per-phase colors)', () => {
    const s = read('components/WorkoutDetails.tsx')
    for (const dead of ['bg-blue-100', 'text-blue-700', 'bg-orange-100', 'text-orange-700', 'text-red-700', 'bg-green-100', 'text-green-700']) {
      expect(s).not.toContain(dead)
    }
    expect(s).toContain('bg-surface')
    expect(s).toContain('text-muted')
    expect(s).toContain('border-line')
  })
  test('destructive flag badge stays red (state preserved)', () => {
    expect(read('components/WorkoutFlagSheet.tsx')).toContain('bg-red-500')
  })
})
