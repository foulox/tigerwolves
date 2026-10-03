import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// #465 Story B — guard the SW source's load-bearing invariants so a future edit
// can't silently drop silent-update or the scope guard. (Static-source assertions;
// the behavioral gate is the offline e2e in Task 4.)
describe('service worker source invariants (#465)', () => {
  const sw = readFileSync(path.resolve(__dirname, '../app/sw.ts'), 'utf8')

  test('silent auto-update is configured', () => {
    expect(sw).toMatch(/skipWaiting:\s*true/)
    expect(sw).toMatch(/clientsClaim:\s*true/)
  })

  test('offline page is the navigation fallback', () => {
    expect(sw).toContain('/offline')
  })

  test('cache policy is driven by the shared classifier, not re-hardcoded', () => {
    expect(sw).toMatch(/sw-cache-policy/)
  })
})
