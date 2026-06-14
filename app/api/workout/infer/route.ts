import { auth } from '@clerk/nextjs/server'
import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { RACE_TYPES, TRAINING_PHASES } from '@/lib/data'

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
- distTime: estimated total distance or time (e.g. "6–8 miles" or "45–50 min")
- lapStructure: concise rep structure using abbreviations (e.g. "3×10min@tempo r2min jog"). Empty string if continuous.
- energySystem: one of "Aerobic", "Lactate Threshold", "Anaerobic", "Mixed"
- hrZone: heart rate zones (e.g. "Z3-Z4" or "Z4-Z5")
- rpe: RPE on 1-10 scale as a string (e.g. "7")
- raceTypes: array from ${JSON.stringify(RACE_TYPES)} — include all race distances this workout meaningfully prepares for
- trainingPhases: array from ${JSON.stringify(TRAINING_PHASES)} — include all phases where this workout fits
- author: source or creator (e.g. "Brad Hudson", "Jack Daniels", "TigerWolves"). Use "TigerWolves" if unknown or original.
- coachingNotes: 1–2 sentence cue for the leader running this workout. Empty string if nothing to add.

Return ONLY valid JSON, no explanation or markdown.`
    }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : ''
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  const inferred: InferredFields = JSON.parse(text)

  return NextResponse.json(inferred)
}
