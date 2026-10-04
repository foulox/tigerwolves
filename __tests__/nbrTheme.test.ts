import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const css = readFileSync(path.resolve(__dirname, '../app/globals.css'), 'utf8')

describe('NBR theme tokens (#466)', () => {
  test('globals.css declares the NBR palette in @theme', () => {
    expect(css).toContain('@theme')
    expect(css).toMatch(/--color-chrome:\s*#0e0e0e/)
    expect(css).toMatch(/--color-chrome-text:\s*#ffffff/)
    expect(css).toMatch(/--color-chrome-muted:\s*#9aa0a6/)
    expect(css).toMatch(/--color-surface:\s*#f6f6f6/)
    expect(css).toMatch(/--color-card:\s*#ffffff/)
    expect(css).toMatch(/--color-line:\s*#e7e7e7/)
    expect(css).toMatch(/--color-ink:\s*#0e0e0e/)
    expect(css).toMatch(/--color-muted:\s*#4a5464/)
    expect(css).toMatch(/--color-accent:\s*#f0523d/)
  })
})
