import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { load } from 'js-yaml'
import { fieldDescription } from '@/lib/schemaSemantics'

const TABLES = ['run_groups', 'workout_families', 'workout_variants', 'routes']

// Extracts column names from a `CREATE TABLE IF NOT EXISTS <table> (...);` block
// in migrate.sql, so this test fails the moment a column is added to the schema
// without a matching entry being added to schema-semantics.yml.
function columnsFromMigration(table: string): string[] {
  const sql = readFileSync(join(process.cwd(), 'scripts', 'migrate.sql'), 'utf-8')
  const match = sql.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(([\\s\\S]*?)\\n\\);`))
  if (!match) throw new Error(`Could not find CREATE TABLE for ${table} in migrate.sql`)
  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split(/\s+/)[0])
}

describe('schema-semantics.yml', () => {
  const yaml = load(
    readFileSync(join(process.cwd(), 'lib', 'schema-semantics.yml'), 'utf-8')
  ) as Record<string, { fields: Record<string, unknown> }>

  it.each(TABLES)('documents every non-id column of %s', (table) => {
    const columns = columnsFromMigration(table)
    const documented = new Set(Object.keys(yaml[table].fields))
    // id and plain foreign-key ids are allowed to be undocumented — see the
    // header comment in schema-semantics.yml.
    const undocumented = columns.filter((c) => c !== 'id' && !c.endsWith('_id') && !documented.has(c))
    expect(undocumented).toEqual([])
  })
})

describe('fieldDescription', () => {
  it('returns the description for a known table/field', () => {
    expect(fieldDescription('workout_variants', 'has_turnaround')).toMatch(/turnaround/i)
  })

  it('collapses multi-line YAML block scalars into single-line prose', () => {
    const description = fieldDescription('workout_variants', 'has_turnaround')
    expect(description).not.toMatch(/\n/)
  })

  it('throws for an unknown field', () => {
    expect(() => fieldDescription('workout_variants', 'not_a_real_field')).toThrow()
  })

  it('throws for an unknown table', () => {
    expect(() => fieldDescription('not_a_real_table', 'name')).toThrow()
  })
})
