import type { DirectionsInput } from './types'

export function buildDirectionsPrompt(input: DirectionsInput): string {
  const shape = input.shape.returnsToStart
    ? 'returns to its start (a loop or out-and-back)'
    : 'point-to-point (ends away from the start)'
  return [
    'You are writing a short, read-aloud route description for a running-club leader to say to their group.',
    'Compose ONE concise paragraph (2-4 sentences), plain spoken tone.',
    '',
    'STRICT RULES:',
    '- Use ONLY the street names and landmark names provided below. Do NOT invent, guess, or add any names not in these lists.',
    '- The streets are given in the exact order they occur along the route. If a street reappears in reverse, phrase it as heading back "the same way".',
    '- Mention the start and turnaround landmarks where natural. Skip landmarks that do not help.',
    '- Do not give compass bearings or "in X feet" instructions. This is a landmark description, not turn-by-turn.',
    '',
    `Route name: ${input.routeName ?? '(unnamed)'}`,
    input.distanceMiles != null ? `Distance: ${input.distanceMiles.toFixed(1)} miles` : 'Distance: unknown',
    `Shape: ${shape}`,
    '',
    'Streets in order:',
    ...input.streets.map((s, i) => `  ${i + 1}. ${s}`),
    '',
    'Landmarks (name @ anchor):',
    ...input.landmarks.map(l => `  - ${l.name} @ ${l.anchor}`),
    '',
    'Return only the paragraph, no preamble.',
  ].join('\n')
}
