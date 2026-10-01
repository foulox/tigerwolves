import { describe, test, expect } from 'vitest'
import manifest from '../app/manifest'

// #478 (Story A): the PWA web manifest must declare standalone display, brand
// identity, and the three Android icon sizes (192, 512, 512-maskable) so that
// "Add to Home Screen" installs a full-screen, no-address-bar app.
describe('web manifest (#478)', () => {
  const m = manifest()

  test('identity + scope', () => {
    expect(m.name).toBe('TigerWolves')
    expect(m.short_name).toBe('TigerWolves')
    expect(m.description).toBeTruthy()
    expect(m.start_url).toBe('/')
    expect(m.scope).toBe('/')
  })

  test('standalone display (full-screen, no address bar)', () => {
    expect(m.display).toBe('standalone')
  })

  test('brand theme + background colors', () => {
    // brand orange (orange-500) + white — see issue #478
    expect(m.theme_color).toBe('#f97316')
    expect(m.background_color).toBe('#ffffff')
  })

  test('icons: 192, 512, and a 512 maskable', () => {
    const icons = m.icons ?? []
    const bySize = (size: string) => icons.filter((i) => i.sizes === size)

    expect(bySize('192x192').length).toBeGreaterThanOrEqual(1)
    expect(bySize('512x512').length).toBeGreaterThanOrEqual(1)

    const maskable = icons.filter((i) => i.purpose === 'maskable')
    expect(maskable.length).toBeGreaterThanOrEqual(1)
    expect(maskable.every((i) => i.sizes === '512x512')).toBe(true)

    // every referenced icon is a PNG served from an absolute path
    for (const icon of icons) {
      expect(icon.type).toBe('image/png')
      expect(icon.src.startsWith('/')).toBe(true)
    }
  })
})
