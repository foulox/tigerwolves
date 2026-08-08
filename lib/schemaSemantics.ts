import { readFileSync } from 'fs'
import { join } from 'path'
import { load } from 'js-yaml'

type FieldSemantics = { description: string }
type TableSemantics = { description: string; fields: Record<string, FieldSemantics> }
type SchemaSemantics = Record<string, TableSemantics>

let cached: SchemaSemantics | null = null

function load_(): SchemaSemantics {
  if (!cached) {
    const raw = readFileSync(join(process.cwd(), 'lib', 'schema-semantics.yml'), 'utf-8')
    cached = load(raw) as SchemaSemantics
  }
  return cached
}

// Trims the YAML block-scalar's trailing newline/whitespace so descriptions read
// as single-line prose when interpolated into a prompt.
function clean(description: string): string {
  return description.trim().replace(/\s+/g, ' ')
}

export function fieldDescription(table: string, field: string): string {
  const semantics = load_()
  const fieldSemantics = semantics[table]?.fields[field]
  if (!fieldSemantics) {
    throw new Error(`No schema-semantics.yml entry for ${table}.${field}`)
  }
  return clean(fieldSemantics.description)
}
