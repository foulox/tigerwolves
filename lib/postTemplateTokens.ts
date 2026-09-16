import { POST_FIELDS } from './postBuilder'

// ---------------------------------------------------------------------------
// Token model
// ---------------------------------------------------------------------------

export type TemplateToken =
  | { type: 'text'; value: string }
  | { type: 'chip'; key: string }

// ---------------------------------------------------------------------------
// parse / serialize
// ---------------------------------------------------------------------------

const FIELD_RE = /\{\{\s*([a-z_]+)\s*\}\}/g

/**
 * Split `template` into ordered tokens.
 * A `{{key}}` whose key ∈ validKeys becomes a chip token;
 * any other `{{…}}` (unknown key, or non-key braces) stays LITERAL TEXT verbatim.
 * Empty-string text tokens are never emitted.
 */
export function parseTemplate(template: string, validKeys: Set<string>): TemplateToken[] {
  const tokens: TemplateToken[] = []
  let lastIndex = 0

  for (const match of template.matchAll(FIELD_RE)) {
    const matchStart = match.index!
    const matchEnd = matchStart + match[0].length
    const key = match[1]

    // Literal text before this match
    if (matchStart > lastIndex) {
      tokens.push({ type: 'text', value: template.slice(lastIndex, matchStart) })
    }

    if (validKeys.has(key)) {
      tokens.push({ type: 'chip', key })
    } else {
      // Unknown key — keep verbatim as a text token
      tokens.push({ type: 'text', value: match[0] })
    }

    lastIndex = matchEnd
  }

  // Trailing literal text after the last match
  if (lastIndex < template.length) {
    tokens.push({ type: 'text', value: template.slice(lastIndex) })
  }

  return tokens
}

/**
 * Inverse of parseTemplate: chip → `{{key}}` (canonical, no inner spaces),
 * text → its value verbatim. Concatenated in order.
 */
export function serializeTokens(tokens: TemplateToken[]): string {
  return tokens.map(t => (t.type === 'chip' ? `{{${t.key}}}` : t.value)).join('')
}

// ---------------------------------------------------------------------------
// Insert menu
// ---------------------------------------------------------------------------

/**
 * Group POST_FIELDS by `source`, preserving first-appearance order of sources
 * AND of fields within each group. Every field in POST_FIELDS appears in
 * exactly one group — none dropped, none duplicated.
 */
export function buildInsertMenu(
  fields: typeof POST_FIELDS,
): { source: string; fields: typeof POST_FIELDS }[] {
  const order: string[] = []
  const groups = new Map<string, typeof POST_FIELDS>()

  for (const field of fields) {
    if (!groups.has(field.source)) {
      order.push(field.source)
      groups.set(field.source, [])
    }
    groups.get(field.source)!.push(field)
  }

  return order.map(source => ({ source, fields: groups.get(source)! }))
}
