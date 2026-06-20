function toSeconds(val: string, unit: string): number {
  return parseInt(val) * (unit.toLowerCase().startsWith('min') ? 60 : 1)
}

function ordinal(n: number): string {
  if (n === 1) return '1st'
  if (n === 2) return '2nd'
  if (n === 3) return '3rd'
  return `${n}th`
}

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

export type Rep = { seconds: number; repNum: number; groupSize: number; groupLabel: string }

export function expandToken(token: string): Rep[] | null {
  const t = token.trim().replace(/\.$/, '')

  const nested = t.match(/^(\d+)[×x]\((.+?)\)/)
  if (nested) {
    const n = parseInt(nested[1])
    let perRep = 0
    for (const p of nested[2].split('/')) {
      const m = p.trim().match(/(\d+)\s*(min|s)/i)
      if (!m) return null
      perRep += toSeconds(m[1], m[2])
    }
    return Array.from({ length: n }, (_, i) => ({
      seconds: perRep, repNum: i + 1, groupSize: n, groupLabel: nested[2].trim(),
    }))
  }

  const sets = t.match(/^(\d+)\s+sets?\s+of\s*\((.+)\)/i)
  if (sets) {
    const n = parseInt(sets[1])
    let perSet = 0
    for (const p of sets[2].split('/')) {
      const m = p.trim().match(/(\d+)\s*(min|s)/i)
      if (m) perSet += toSeconds(m[1], m[2])
    }
    return Array.from({ length: n }, (_, i) => ({
      seconds: perSet, repNum: i + 1, groupSize: n, groupLabel: `set ${i + 1}`,
    }))
  }

  const multi = t.match(/^(\d+)\s*[×x]\s*(\d+)\s*(min|s)/i)
  if (multi) {
    const n = parseInt(multi[1])
    const d = toSeconds(multi[2], multi[3])
    return Array.from({ length: n }, (_, i) => ({
      seconds: d, repNum: i + 1, groupSize: n, groupLabel: t,
    }))
  }

  const single = t.match(/^(\d+)\s*(min|s)/i)
  if (single) {
    return [{ seconds: toSeconds(single[1], single[2]), repNum: 1, groupSize: 1, groupLabel: t }]
  }

  return null
}

export function extractMain(instructions: string): string | null {
  const mainIdx = instructions.indexOf('Main:')
  if (mainIdx === -1) return null
  const afterMain = instructions.slice(mainIdx + 5).trim()
  const cdMatch = afterMain.match(/\.\s*CD:|\s+CD:/i)
  return (cdMatch ? afterMain.slice(0, cdMatch.index) : afterMain).trim()
}

export function computeTurnaround(instructions: string): string {
  const mainPart = extractMain(instructions)
  if (!mainPart) return '↩️ TURN AROUND: [add before posting]'

  const tokens = mainPart.includes(' + ')
    ? mainPart.split(' + ')
    : splitRespectParens(mainPart, ' / ')

  const allReps: Rep[] = []
  for (const token of tokens) {
    const reps = expandToken(token)
    if (!reps) return '↩️ TURN AROUND: [add before posting]'
    allReps.push(...reps)
  }

  const halfway = allReps.reduce((s, r) => s + r.seconds, 0) / 2
  let cumulative = 0

  for (const rep of allReps) {
    cumulative += rep.seconds
    if (cumulative >= halfway) {
      if (rep.groupSize > 1 && rep.groupLabel.startsWith('set ')) {
        return `↩️ TURN AROUND: After ${rep.groupLabel}`
      } else if (rep.groupSize > 1) {
        return `↩️ TURN AROUND: After the ${ordinal(rep.repNum)} rep of the ${rep.groupLabel}`
      } else {
        return `↩️ TURN AROUND: After the ${rep.groupLabel}`
      }
    }
  }

  return '↩️ TURN AROUND: [add before posting]'
}

export function formatDateLong(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
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

import type { ScheduleEntry, Workout } from './data'
import { RUN_LEADERS } from './data'

export function buildPost(entry: ScheduleEntry, selections: Workout[]): string {
  const sorted = [...selections].sort((a, b) => (a.progression ?? 0) - (b.progression ?? 0))
  const primary = sorted[0]

  const lines = [
    '🐯🐺 TigerWolves Tuesday Workout',
    '',
    `📅 ${formatDateLong(entry.date)}`,
    `🏃🏻‍♂️‍➡️ ${entry.workoutType}: ${primary.name}`,
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
    const stdContent = standard.variation || formatMainContent(standard.instructions)
    const lngContent = longer.variation || formatMainContent(longer.instructions)
    const stdTa = standard.hasTurnaround ? (standard.turnaroundDistance ? `↩️ TURN AROUND: ${standard.turnaroundDistance}` : '↩️ TURN AROUND: [add before posting]') : null
    const lngTa = longer.hasTurnaround ? (longer.turnaroundDistance ? `↩️ TURN AROUND: ${longer.turnaroundDistance}` : '↩️ TURN AROUND: [add before posting]') : null
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
    const ta = w.hasTurnaround ? (w.turnaroundDistance ? `↩️ TURN AROUND: ${w.turnaroundDistance}` : '↩️ TURN AROUND: [add before posting]') : null
    lines.push(w.variation ? `🏁🏃🏻‍♂️‍➡️ WORKOUT 🏃🏻‍♂️‍➡️🏁\n${w.variation}` : formatMainSection(w.instructions))
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
