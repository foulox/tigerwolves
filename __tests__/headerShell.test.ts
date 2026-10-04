// __tests__/headerShell.test.ts
import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
const src = readFileSync(path.resolve(__dirname, '../components/Header.tsx'), 'utf8')

describe('NBR dark header (#466)', () => {
  test('header uses the dark chrome token, not the old light bg', () => {
    expect(src).toContain('bg-chrome')
    expect(src).not.toContain('bg-gray-50')
  })
  test('header renders the NBR logo', () => {
    expect(src).toContain('/nbr-logo.png')
  })
  test('the signed-in flash guard (isLoaded) is retained', () => {
    expect(src).toContain('isLoaded')
  })
})
