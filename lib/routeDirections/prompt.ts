import type { DirectionsInput } from './types'

export function buildDirectionsPrompt(input: DirectionsInput): string {
  const shape = input.shape.returnsToStart ? 'returns to its start (loop or out-and-back)' : 'point-to-point'
  const leg = (l: DirectionsInput['legs'][number], i: number) => {
    const turn = l.turn === 'none' ? 'continue onto' : l.turn === 'turnaround' ? 'TURN AROUND, then' : `turn ${l.turn} onto`
    const feat = l.feature === 'bridge' ? ' [bridge]' : l.feature === 'park' ? ' [park]' : ''
    return `  ${i + 1}. ${turn} ${l.street}${feat} — ${l.miles.toFixed(2)} mi`
  }
  return [
    'You are writing a short, read-aloud route description for a running-club leader to say to their group.',
    'Compose 2-5 sentences, plain spoken tone. Return only the paragraph.',
    '',
    'STRICT RULES:',
    '- Use ONLY the street and landmark names provided. NEVER invent or fabricate a name or a turn direction not given below.',
    '- Follow the legs in order. Weave in the distance for named stretches ("follow Meeker Avenue for about a mile"); round naturally; skip distances for short connectors.',
    '- A leg marked [bridge]: describe the move ("onto the Kosciuszko Bridge") WITHOUT a left/right — the direction is obvious.',
    '- A leg marked [park]: KEEP the left/right — entry direction matters.',
    '- A leg with "continue onto": do NOT state a left/right (we are not sure); just say "onto" or "pick up".',
    '- "TURN AROUND" is the route turnaround — phrase it as turning around / heading back the same way, never a left/right.',
    '- Mention start/turnaround landmarks where natural. No compass bearings.',
    '',
    `Route: ${input.routeName ?? '(unnamed)'}`,
    typeof input.distanceMiles === 'number' ? `Total distance: ${input.distanceMiles.toFixed(1)} miles` : 'Total distance: unknown',
    `Shape: ${shape}`,
    '',
    'Legs in order (instruction | street | distance):',
    ...input.legs.map(leg),
    '',
    'Landmarks (name @ anchor):',
    ...input.landmarks.map(l => `  - ${l.name} @ ${l.anchor}`),
  ].join('\n')
}
