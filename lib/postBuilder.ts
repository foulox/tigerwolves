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

export function buildPost(
  entry: ScheduleEntry,
  selections: WorkoutVariantRow[],
  runConfig: RunConfig,
  roster: string[],
  activeType: string | null = null,
): string {
  const sorted = [...selections].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  const primary = sorted[0]

  // #322: only a Workout-kind run emits the structured WORKOUT section (the
  // type:name line, the reason, and the workout block). A non-workout run
  // (Easy/Long/Beginner-Friendly/Food) may legitimately have no selections at
  // all, so never dereference `primary` outside this guard.
  const showWorkout = isWorkoutKind(runConfig.kind) && primary != null

  const lines = [
    // post_header is the FULL editable opening block (run name/emoji, the app link,
    // any standing prompts) — stored per-run in runs.post_header and edited via the
    // Post Template UI. Nothing app- or run-specific is hardcoded here anymore (#310):
    // that previously duplicated the app link/prompt lines against what the DB already
    // held. buildPost emits post_header verbatim, then the dynamic date/workout block.
    runConfig.postHeader,
    '',
    `📅 ${formatDateLong(entry.date)}`,
  ]

  if (showWorkout) {
    lines.push(`🏃🏻‍♂️‍➡️ ${activeType ?? entry.workoutType}: ${primary.name}`)
    if (primary.reason) lines.push('', primary.reason)
  }

  lines.push('', ...runConfig.meetingLocation.split('\n').map((l, i) => i === 0 ? `📍 ${l}` : l), '')

  if (showWorkout) {
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
  }

  lines.push(
    '',
    runConfig.closingNotes,
    '',
    `Led by ${entry.leader} — see you out there! 🔥`,
    `${runConfig.leaderIntro} ${roster.join(', ')}`,
  )

  return lines.join('\n')
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
