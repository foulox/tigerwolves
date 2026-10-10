import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { WHATS_NEW } from '../lib/whatsNew'

const read = (p: string) => readFileSync(path.resolve(__dirname, '..', p), 'utf8')

describe('app-brand strings say NBR; run-level stay (#466)', () => {
  test('whatsNew Roadmap entry references NBR, not TigerWolves', () => {
    const r = WHATS_NEW.find((e) => e.title === 'Roadmap')!
    expect(r.description).toContain('NBR')
    expect(r.description).not.toContain('TigerWolves')
  })
  test('app-brand files no longer say TigerWolves', () => {
    expect(read('components/WhatsNewOverlay.tsx')).not.toContain('to TigerWolves')
    expect(read('app/roadmap/page.tsx')).not.toContain('TigerWolves is going')
    expect(read('app/all-runs/page.tsx')).not.toContain('All Runs — TigerWolves')
  })
  test('run-level postHeader fallbacks are left literal', () => {
    expect(read('app/library/page.tsx')).toContain('🐯🐺 TigerWolves Tuesday Workout')
    expect(read('app/schedule/page.tsx')).toContain('🐯🐺 TigerWolves Tuesday Workout')
  })
})
