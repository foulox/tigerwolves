export function splitRespectParens(str: string, sep: string): string[] {
  const result: string[] = []
  let depth = 0, cur = '', i = 0
  while (i < str.length) {
    if (str[i] === '(') depth++
    else if (str[i] === ')') depth--
    if (depth === 0 && str.slice(i, i + sep.length) === sep) {
      result.push(cur); cur = ''; i += sep.length; continue
    }
    cur += str[i++]
  }
  result.push(cur)
  return result
}

export function extractMain(instructions: string): string | null {
  const mainIdx = instructions.indexOf('Main:')
  if (mainIdx === -1) return null
  const afterMain = instructions.slice(mainIdx + 5).trim()
  const cdMatch = afterMain.match(/\.\s*CD:|\s+CD:/i)
  return (cdMatch ? afterMain.slice(0, cdMatch.index) : afterMain).trim()
}

export function formatDateLong(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

export function formatDateMedium(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

export function formatMainSection(instructions: string): string {
  const mainPart = extractMain(instructions)
  if (!mainPart) return `🏁🏃🏻‍♂️‍➡️ WORKOUT 🏃🏻‍♂️‍➡️🏁\n${instructions}`
  const formatted = mainPart.includes(' + ')
    ? mainPart.replace(/\s*\+\s*/g, ' +\n')
    : splitRespectParens(mainPart, ' / ').join(' /\n')
  return `🏁🏃🏻‍♂️‍➡️ WORKOUT 🏃🏻‍♂️‍➡️🏁\n${formatted}`
}

export function formatMainContent(instructions: string): string {
  const mainPart = extractMain(instructions)
  if (!mainPart) return instructions
  if (mainPart.includes(' + ')) return mainPart.replace(/\s*\+\s*/g, ' +\n')
  return splitRespectParens(mainPart, ' / ').join(' /\n')
}

import type { ScheduleEntry, WorkoutVariantRow, RunConfig } from './data'
import { isWorkoutKind } from './runProfile'

// Turnaround is a stored field now (has_turnaround/turnaround, set at write time —
// AI-suggested, leader-editable), not computed from instructions text. If
// has_turnaround is true but no turnaround text was ever set, omit the line
// silently rather than showing a placeholder — a leader reviews the post before
// it goes out either way.
function turnaroundLine(w: WorkoutVariantRow): string | null {
  return w.hasTurnaround && w.turnaround ? `↩️ TURN AROUND: ${w.turnaround}` : null
}

// ---------------------------------------------------------------------------
// Merge-field catalog
// ---------------------------------------------------------------------------

export const POST_FIELDS: {
  key: string
  label: string
  source: 'schedule' | 'run' | 'roster' | 'record'
  affix: string
}[] = [
  { key: 'date',            label: 'Date',          source: 'schedule', affix: '📅' },
  { key: 'day_leader',      label: 'Day leader',    source: 'schedule', affix: '' },
  { key: 'location',        label: 'Location',      source: 'run',      affix: '📍' },
  { key: 'time',            label: 'Time',          source: 'run',      affix: '🕕' },
  { key: 'description',     label: 'Description',   source: 'run',      affix: '' },
  { key: 'leaders',         label: 'Leaders',       source: 'roster',   affix: '' },
  { key: 'workout_name',    label: 'Workout name',  source: 'record',   affix: '' },
  { key: 'reason',          label: 'Reason',        source: 'record',   affix: '' },
  { key: 'workout_details', label: 'Workout block', source: 'record',   affix: '' },
  { key: 'distance',        label: 'Distance',      source: 'record',   affix: '🏃' },
  { key: 'route_link',      label: 'Route link',    source: 'record',   affix: '🗺️' },
]

// ---------------------------------------------------------------------------
// Resolve context — computed once per render call
// ---------------------------------------------------------------------------

type RenderCtx = {
  entry: ScheduleEntry
  selections: WorkoutVariantRow[]
  runConfig: RunConfig
  roster: string[]
  activeType?: string | null
}

function resolveField(key: string, ctx: RenderCtx): string {
  const { entry, selections, runConfig, roster, activeType } = ctx
  const sorted = [...selections].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  const primary = sorted[0]
  const showWorkout = isWorkoutKind(runConfig.kind) && primary != null
  const showLightWorkout = !isWorkoutKind(runConfig.kind) && primary != null

  switch (key) {
    case 'date':
      return `📅 ${formatDateLong(entry.date)}`

    case 'day_leader':
      return entry.leader

    case 'location': {
      const locationLines = runConfig.meetingLocation.split('\n')
      return locationLines.map((l, i) => (i === 0 ? `📍 ${l}` : l)).join('\n')
    }

    case 'time':
      return runConfig.meetingTime ? `🕕 ${runConfig.meetingTime}` : ''

    case 'description':
      return runConfig.description ?? ''

    case 'leaders':
      return roster.length > 0 ? roster.join(', ') : ''

    case 'workout_name':
      if (showWorkout) return `🏃🏻‍♂️‍➡️ ${activeType ?? entry.workoutType}: ${primary.name}`
      if (showLightWorkout) return `🏃🏻‍♂️‍➡️ ${primary.name}`
      return ''

    case 'reason':
      return primary?.reason ?? ''

    case 'workout_details': {
      if (!showWorkout) return ''
      const lines: string[] = []
      if (sorted.length === 2) {
        const [standard, longer] = sorted
        const stdContent = formatMainContent(standard.rawInput)
        const lngContent = formatMainContent(longer.rawInput)
        const stdTa = turnaroundLine(standard)
        const lngTa = turnaroundLine(longer)
        lines.push(
          '🏁🏃🏻‍♂️‍➡️ WORKOUT 🏃🏻‍♂️‍➡️🏁',
          '',
          'Standard',
          stdContent,
          ...(stdTa ? [stdTa] : []),
          '',
          'Longer',
          lngContent,
          ...(lngTa ? [lngTa] : []),
        )
      } else {
        const w = sorted[0]
        const ta = turnaroundLine(w)
        lines.push(formatMainSection(w.rawInput))
        if (ta) lines.push('', ta)
      }
      return lines.join('\n')
    }

    case 'distance':
      return primary?.distTime ? `🏃 ${primary.distTime}` : ''

    case 'route_link':
      return primary?.mapLink ? `🗺️ ${primary.mapLink}` : ''

    default:
      return ''
  }
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export function renderPostTemplate(
  template: string,
  entry: ScheduleEntry,
  selections: WorkoutVariantRow[],
  runConfig: RunConfig,
  roster: string[],
  activeType?: string | null,
): string {
  const ctx: RenderCtx = { entry, selections, runConfig, roster, activeType }

  // Substitute {{key}} tokens (optional whitespace inside braces)
  let result = template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_match, key: string) =>
    resolveField(key, ctx),
  )

  // Trim trailing spaces before newlines
  result = result.replace(/ +(?=\n)/g, '')

  // Collapse runs of 3+ consecutive newlines to exactly 2
  result = result.replace(/\n{3,}/g, '\n\n')

  return result
}

// ---------------------------------------------------------------------------
// Default template (single layout — no isWorkoutKind branching)
// ---------------------------------------------------------------------------

export function defaultTemplate(runConfig: RunConfig): string {
  return [
    runConfig.postHeader,
    '',
    '{{date}}',
    '{{workout_name}}',
    '',
    '{{reason}}',
    '',
    '{{location}}',
    '{{time}}',
    '',
    '{{description}}',
    '{{distance}}',
    '{{route_link}}',
    '',
    '{{workout_details}}',
    '',
    runConfig.closingNotes,
    '',
    'Led by {{day_leader}} — see you out there! 🔥',
    `${runConfig.leaderIntro} {{leaders}}`,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Public API — signature unchanged
// ---------------------------------------------------------------------------

export function buildPost(
  entry: ScheduleEntry,
  selections: WorkoutVariantRow[],
  runConfig: RunConfig,
  roster: string[],
  activeType: string | null = null,
): string {
  return renderPostTemplate(
    runConfig.postTemplate ?? defaultTemplate(runConfig),
    entry,
    selections,
    runConfig,
    roster,
    activeType,
  )
}

const ROUTE_TYPES = new Set(['Route', 'Easy', 'Long'])

export function buildVerificationLabel(workout: WorkoutVariantRow): string {
  const dist = workout.distTime ? `, ${workout.distTime}` : ''

  if (ROUTE_TYPES.has(workout.type)) {
    return `I've verified: ${workout.name}${dist}`
  }

  // Extract main interval details from rawInput
  const main = extractMain(workout.rawInput)
  if (main) {
    const condensed = main.length > 60 ? main.slice(0, 60) + '…' : main
    return `I've verified: ${condensed}${dist}`
  }

  return `I've verified: ${workout.name}${dist || ' — key workout details'}`
}
