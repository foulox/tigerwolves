import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
const src = readFileSync(path.resolve(__dirname, '../components/RacesClient.tsx'), 'utf8')
describe('Races reskin (#491)', () => {
  test('NBR tokens present; orange primary gone; tier colors collapsed', () => {
    for (const t of ['bg-accent', 'bg-card', 'border-line', 'text-ink', 'text-muted']) expect(src).toContain(t)
    for (const dead of ['bg-orange-600', 'bg-orange-100', 'text-orange-700', 'bg-blue-100', 'bg-blue-50']) expect(src).not.toContain(dead)
  })
  test('semantic status colors preserved', () => {
    for (const keep of ['bg-green-500', 'bg-red-500', 'bg-yellow-500', 'bg-green-100', 'bg-red-100']) expect(src).toContain(keep)
  })
})
