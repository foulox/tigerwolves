import { auth } from '@clerk/nextjs/server'
import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { RACE_TYPES, TRAINING_PHASES } from '@/lib/data'
import { fieldDescription } from '@/lib/schemaSemantics'

const client = new Anthropic()

export type InferredFields = {
  distTime: string
  lapStructure: string
  energySystem: string
  hrZone: string
  rpe: string
  raceTypes: string[]
  trainingPhases: string[]
  author: string
  coachingNotes: string
}

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return new Response('Unauthorized', { status: 401 })
  const { name, category, type, instructions, reason } = await req.json()

  // lapStructure has no schema-semantics.yml entry: the new workout_variants schema
  // has no dedicated structure column, since #271 decided structure lives in raw_input.
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

Return a JSON object with exactly these fields:
- distTime: ${fieldDescription('workout_variants', 'dist_time')}
- lapStructure: concise rep structure using abbreviations (e.g. "3×10min@tempo r2min jog"). Empty string if continuous.
- energySystem: ${fieldDescription('workout_variants', 'energy_system')}
- hrZone: ${fieldDescription('workout_variants', 'hr_zone')}
- rpe: ${fieldDescription('workout_variants', 'rpe')}
- raceTypes: array from ${JSON.stringify(RACE_TYPES)} — ${fieldDescription('workout_variants', 'race_types')}
- trainingPhases: array from ${JSON.stringify(TRAINING_PHASES)} — ${fieldDescription('workout_variants', 'training_phases')}
- author: ${fieldDescription('workout_families', 'author')}
- coachingNotes: ${fieldDescription('workout_families', 'coaching_notes')} 1–2 sentences. Empty string if nothing to add.

Return ONLY valid JSON, no explanation or markdown.`
    }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : ''
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  const inferred: InferredFields = JSON.parse(text)

  return NextResponse.json(inferred)
}
