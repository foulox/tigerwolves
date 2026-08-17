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

import type { ScheduleEntry, WorkoutVariantRow } from './data'
import { RUN_LEADERS } from './data'

// Turnaround is a stored field now (has_turnaround/turnaround, set at write time —
// AI-suggested, leader-editable), not computed from instructions text. If
// has_turnaround is true but no turnaround text was ever set, omit the line
// silently rather than showing a placeholder — a leader reviews the post before
// it goes out either way.
function turnaroundLine(w: WorkoutVariantRow): string | null {
  return w.hasTurnaround && w.turnaround ? `↩️ TURN AROUND: ${w.turnaround}` : null
}

export function buildPost(entry: ScheduleEntry, selections: WorkoutVariantRow[], activeType: string | null = null): string {
  const sorted = [...selections].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  const primary = sorted[0]

  const lines = [
    '🐯🐺 TigerWolves Tuesday Workout',
    '',
    '👉 https://tigerwolves.foulox.me 👈',
    '👀 See every workout between now and the NYC Marathon in the app',
    '🗳️ React to let us know what you like — and what you don\'t',
    '',
    `📅 ${formatDateLong(entry.date)}`,
    `🏃🏻‍♂️‍➡️ ${activeType ?? entry.workoutType}: ${primary.name}`,
  ]

  if (primary.reason) lines.push('', primary.reason)

  lines.push(
    '',
    '📍 Starting point and route: Tom Stofka Garden, aka "Da Bins."',
    'We\'ll warm up by jogging to Marsha P. Johnson which is at the corner of North 8th and Kent',
    'The run will be along the Kent Avenue Speedway',
    'We\'ll finish up back at Marsha P. Johnson State Park and cool down with a jog to the track',
    '',
  )

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

  lines.push(
    '',
    'Bag Drop: Sorry, Not available',
    '',
    `Led by ${entry.leader} — see you out there! 🔥`,
    `Run Leaders: ${RUN_LEADERS.join(', ')}`,
  )

  return lines.join('\n')
}
