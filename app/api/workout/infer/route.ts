import { auth } from '@clerk/nextjs/server'
import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { RACE_TYPES, TRAINING_PHASES } from '@/lib/data'
import { fieldDescription } from '@/lib/schemaSemantics'
import { parseInferredFields } from '@/lib/workoutInference'

export type { InferredFields } from '@/lib/workoutInference'

const client = new Anthropic()

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return new Response('Unauthorized', { status: 401 })
  const { name, category, type, instructions, reason, venue } = await req.json()

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `You are a running coach assistant. Given a workout's basic details, infer the missing training metadata.

Workout:
Name: ${name}
Category: ${category}
Type: ${type}
Instructions: ${instructions}
Purpose: ${reason}
Run group venue: ${venue ?? 'unspecified'}

Return a JSON object with exactly these fields:
- distTime: ${fieldDescription('workout_variants', 'dist_time')}
- energySystem: ${fieldDescription('workout_variants', 'energy_system')}
- hrZone: ${fieldDescription('workout_variants', 'hr_zone')}
- rpe: ${fieldDescription('workout_variants', 'rpe')}
- raceTypes: array from ${JSON.stringify(RACE_TYPES)} — ${fieldDescription('workout_variants', 'race_types')}
- trainingPhases: array from ${JSON.stringify(TRAINING_PHASES)} — ${fieldDescription('workout_variants', 'training_phases')}
- author: ${fieldDescription('workout_families', 'author')}
- coachingNotes: ${fieldDescription('workout_families', 'coaching_notes')} 1–2 sentences. Empty string if nothing to add.
- hasTurnaround: ${fieldDescription('workout_variants', 'has_turnaround')} Return true or false — track venues typically don't need one, but judge from the instructions themselves too; road workouts can still be false.
- turnaround: ${fieldDescription('workout_variants', 'turnaround')} Empty string if hasTurnaround is false.

Return ONLY valid JSON, no explanation or markdown.`
    }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : ''
  const inferred = parseInferredFields(raw)

  return NextResponse.json(inferred)
}
