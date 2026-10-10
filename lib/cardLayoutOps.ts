import type { CardTemplate, CardFieldKey, FieldAlign } from './data'
import { DEFAULT_CARD_TEMPLATE } from './cardLayout'

export type RowSection = 'upfront' | 'expanded'
export type Destination = RowSection | 'hidden'

export const CARD_FIELD_LABELS: Record<CardFieldKey, string> = {
  description:     'Description',
  coachingNotes:   'Coaching notes',
  distance:        'Distance & elevation',
  lastRan:         'Last ran',
  mapLink:         'Map link',
  mapImage:        'Route map image',
  routeNarrative:  'Route directions',
  reason:          'Reason',
  energySystem:    'Energy system',
  hrZone:          'HR zone',
  rpe:             'RPE',
  turnaround:      'Turnaround',
  raceTypes:       'Race types',
  trainingPhases:  'Training phases',
  author:          'Author',
}

const ALL_KEYS = Object.keys(CARD_FIELD_LABELS) as CardFieldKey[]

// Remove a key from all rows in a section, dropping rows that become empty.
function removeFromSection(rows: CardTemplate['upfront'], key: CardFieldKey): CardTemplate['upfront'] {
  return rows
    .map(row => ({ fields: row.fields.filter(f => f.key !== key) }))
    .filter(row => row.fields.length > 0)
}

// Remove a key from everywhere in the template (rows + hidden).
function removeKey(t: CardTemplate, key: CardFieldKey): CardTemplate {
  return {
    ...t,
    upfront:  removeFromSection(t.upfront,  key),
    expanded: removeFromSection(t.expanded, key),
    hidden:   t.hidden.filter(k => k !== key),
  }
}

export function normalizeTemplate(t: CardTemplate | null): CardTemplate {
  const base = t === null ? structuredClone(DEFAULT_CARD_TEMPLATE) : structuredClone(t)
  const placed = new Set<CardFieldKey>([
    ...base.upfront.flatMap(r => r.fields.map(f => f.key)),
    ...base.expanded.flatMap(r => r.fields.map(f => f.key)),
    ...base.hidden,
  ])
  const missing = ALL_KEYS.filter(k => !placed.has(k))
  return { ...base, hidden: [...base.hidden, ...missing] }
}

export function moveToField(t: CardTemplate, key: CardFieldKey, dest: Destination): CardTemplate {
  const stripped = removeKey(t, key)
  if (dest === 'hidden') {
    return { ...stripped, hidden: [...stripped.hidden, key] }
  }
  const newRow = { fields: [{ key, align: 'left' as FieldAlign }] }
  return { ...stripped, [dest]: [...stripped[dest], newRow] }
}

export function setAlign(t: CardTemplate, key: CardFieldKey, align: FieldAlign): CardTemplate {
  const mapSection = (rows: CardTemplate['upfront']) =>
    rows.map(row => ({
      fields: row.fields.map(f => f.key === key ? { ...f, align } : f),
    }))
  return {
    ...t,
    upfront:  mapSection(t.upfront),
    expanded: mapSection(t.expanded),
  }
}

export function moveRow(
  t: CardTemplate,
  section: RowSection,
  rowIndex: number,
  dir: 'up' | 'down',
): CardTemplate {
  const rows = t[section]
  const swapIdx = dir === 'up' ? rowIndex - 1 : rowIndex + 1
  if (swapIdx < 0 || swapIdx >= rows.length) return t  // clamp — no-op
  const next = [...rows]
  ;[next[rowIndex], next[swapIdx]] = [next[swapIdx], next[rowIndex]]
  return { ...t, [section]: next }
}

export function mergeRowUp(
  t: CardTemplate,
  section: RowSection,
  rowIndex: number,
): CardTemplate {
  if (rowIndex === 0) return t  // no-op
  const rows = t[section]
  const next = rows.map((row, i) => {
    if (i === rowIndex - 1) {
      return { fields: [...row.fields, ...rows[rowIndex].fields] }
    }
    return row
  }).filter((_, i) => i !== rowIndex)
  return { ...t, [section]: next }
}

export function splitToNewRow(t: CardTemplate, key: CardFieldKey): CardTemplate {
  const splitSection = (rows: CardTemplate['upfront']): CardTemplate['upfront'] | null => {
    for (let i = 0; i < rows.length; i++) {
      const fieldIdx = rows[i].fields.findIndex(f => f.key === key)
      if (fieldIdx === -1) continue
      const field = rows[i].fields[fieldIdx]
      const remainingFields = rows[i].fields.filter(f => f.key !== key)
      const next = [...rows]
      if (remainingFields.length === 0) {
        // Row becomes just the split field — already a single-field row, insert after
        next.splice(i + 1, 0, { fields: [{ key: field.key, align: field.align }] })
        next[i] = { fields: [] }  // will be filtered
        return next.filter(r => r.fields.length > 0)
      } else {
        next[i] = { fields: remainingFields }
        next.splice(i + 1, 0, { fields: [{ key: field.key, align: field.align }] })
        return next
      }
    }
    return null
  }

  const upfrontResult = splitSection(t.upfront)
  if (upfrontResult !== null) return { ...t, upfront: upfrontResult }

  const expandedResult = splitSection(t.expanded)
  if (expandedResult !== null) return { ...t, expanded: expandedResult }

  return t  // key not found in any row — return unchanged
}
