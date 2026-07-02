import { describe, it, expect } from 'vitest'
import { sql } from '../lib/db'

describe('database connection and schema', () => {
  it('connects to the database', async () => {
    const result = await sql`SELECT 1 AS ok`
    expect(result[0].ok).toBe(1)
  })

  it('workouts table exists with correct columns', async () => {
    const rows = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'workouts'
      ORDER BY column_name
    `
    const cols = rows.map((r) => r.column_name as string)
    expect(cols).toContain('id')
    expect(cols).toContain('name')
    expect(cols).toContain('variation')
    expect(cols).toContain('has_turnaround')
    expect(cols).toContain('race_types')
    expect(cols).toContain('training_phases')
  })

  it('schedule table exists', async () => {
    const rows = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'schedule'
    `
    expect(rows.length).toBeGreaterThan(0)
  })

  it('races table exists', async () => {
    const rows = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'races'
    `
    expect(rows.length).toBeGreaterThan(0)
  })

  it('run_leaders table exists', async () => {
    const rows = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'run_leaders'
    `
    expect(rows.length).toBeGreaterThan(0)
  })
})
