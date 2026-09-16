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

// ---------------------------------------------------------------------------
// DOM → tokens (editor read-back)
// ---------------------------------------------------------------------------

// Minimal, DOM-agnostic view of a node the walker needs. Real DOM nodes satisfy
// this structurally at runtime (Text and HTMLElement both carry nodeType/
// nodeName/textContent/childNodes; elements also carry `dataset`), so the editor
// component passes `editorRef.current.childNodes` with a cast. Keeping the shape
// structural is what lets domNodesToTokens be unit-tested with plain object trees
// in a DOM-less (node) environment — the walk has regressed on newline handling
// more than once precisely because it was previously untestable.
export interface WalkNode {
  readonly nodeType: number // 3 = text node, 1 = element (DOM node-type constants)
  readonly nodeName: string // '#text', 'BR', 'DIV', 'P', 'SPAN', …
  readonly textContent: string | null
  readonly childNodes: ArrayLike<WalkNode>
  readonly dataset?: { readonly key?: string } // chip elements carry data-key
}

const TEXT_NODE = 3
const ELEMENT_NODE = 1

/**
 * Re-derive the ordered token model from a contenteditable editor's child nodes.
 * Pure and DOM-agnostic (operates on the structural WalkNode view) so it can be
 * unit-tested without a real DOM.
 *
 * Walk rules, in order:
 *   - text node        → verbatim text token
 *   - <br>             → '\n' ALWAYS — a soft break, or the filler the browser
 *                        puts in an otherwise-empty line (`<div><br></div>`)
 *   - chip (data-key)  → chip token; NOT descended into, so a chip's inner ✕ glyph
 *                        never leaks into the serialized template
 *   - block <div>/<p>  → a '\n' boundary before its contents (unless it's the very
 *                        first content, and never doubling an existing trailing
 *                        newline), then recurse into its children
 *   - other element    → recurse (inline wrappers carry no boundary of their own)
 *
 * The block-boundary de-dup (`lastEndsInNewline`) is what stops a `<br>` that is
 * immediately followed by a block from doubling, while still letting an empty
 * `<div><br></div>` between two blocks produce a real blank line ('\n\n').
 * Adjacent text is merged and empty-string text tokens dropped — the exact shape
 * parseTemplate/serializeTokens round-trip through.
 */
export function domNodesToTokens(nodes: ArrayLike<WalkNode>): TemplateToken[] {
  const raw: TemplateToken[] = []
  let hasContent = false

  const pushText = (value: string) => {
    if (value === '') return
    raw.push({ type: 'text', value })
    hasContent = true
  }
  const pushNewline = () => {
    raw.push({ type: 'text', value: '\n' })
    hasContent = true
  }
  const pushChip = (key: string) => {
    raw.push({ type: 'chip', key })
    hasContent = true
  }
  // Did the last thing we emitted end in a newline? Guards the block-boundary
  // newline against doubling when the previous line already closed with one.
  const lastEndsInNewline = () => {
    const last = raw[raw.length - 1]
    return !!last && last.type === 'text' && last.value.endsWith('\n')
  }
  const isBlock = (node: WalkNode) =>
    node.nodeType === ELEMENT_NODE &&
    (node.nodeName === 'DIV' || node.nodeName === 'P') &&
    !node.dataset?.key

  const walkAll = (list: ArrayLike<WalkNode>) => {
    for (let i = 0; i < list.length; i++) walk(list[i])
  }

  const walk = (node: WalkNode) => {
    if (node.nodeType === TEXT_NODE) {
      pushText(node.textContent ?? '')
      return
    }
    if (node.nodeName === 'BR') {
      pushNewline()
      return
    }
    if (node.nodeType === ELEMENT_NODE && node.dataset?.key) {
      pushChip(node.dataset.key)
      return
    }
    if (isBlock(node)) {
      if (hasContent && !lastEndsInNewline()) pushNewline()
      walkAll(node.childNodes)
      return
    }
    if (node.nodeType === ELEMENT_NODE) {
      // Inline wrapper (e.g. a <span> from styling): descend, no boundary.
      walkAll(node.childNodes)
    }
  }

  walkAll(nodes)

  // Merge adjacent text tokens into one, dropping empties — the shape
  // serializeTokens/parseTemplate round-trip through.
  const out: TemplateToken[] = []
  for (const tok of raw) {
    if (tok.type === 'text') {
      if (tok.value === '') continue
      const prev = out[out.length - 1]
      if (prev && prev.type === 'text') {
        prev.value += tok.value
        continue
      }
    }
    out.push(tok)
  }
  return out
}
