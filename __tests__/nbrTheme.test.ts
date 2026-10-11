import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const css = readFileSync(path.resolve(__dirname, '../app/globals.css'), 'utf8')

describe('NBR theme tokens (#510 v2 reskin)', () => {
  test('globals.css declares the real NBR palette in @theme', () => {
    expect(css).toContain('@theme')
    expect(css).toMatch(/--color-chrome:\s*#000000/)
    expect(css).toMatch(/--color-chrome-text:\s*#ffffff/)
    expect(css).toMatch(/--color-chrome-muted:\s*#9aa0a6/)
    expect(css).toMatch(/--color-surface:\s*#ffffff/)
    expect(css).toMatch(/--color-card:\s*#ffffff/)
    expect(css).toMatch(/--color-line:\s*#e6e5e5/)
    expect(css).toMatch(/--color-ink:\s*#1f1f1f/)
    expect(css).toMatch(/--color-muted:\s*#747474/)
    // cyan is the only non-monochrome token, reserved for links.
    expect(css).toMatch(/--color-link:\s*#00c3eb/)
    // --color-accent is deprecated (repointed red→ink) so components migrated in
    // later stories keep rendering monochrome until the token is removed.
    expect(css).toMatch(/--color-accent:\s*#1f1f1f/)
  })

  test('display/body fonts map to the next/font variables', () => {
    expect(css).toMatch(/--font-display:\s*var\(--font-jost\)/)
    expect(css).toMatch(/--font-sans:\s*var\(--font-mulish\)/)
  })
})
