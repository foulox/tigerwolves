import { auth } from '@clerk/nextjs/server'
import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { buildInferPrompt, parseInferredFields } from '@/lib/workoutInference'

export type { InferredFields } from '@/lib/workoutInference'

const client = new Anthropic()

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return new Response('Unauthorized', { status: 401 })
  const { name, category, type, instructions, reason, venue, hasTurnaroundHint } = await req.json()

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: buildInferPrompt({ name, category, type, instructions, reason, venue, hasTurnaroundHint }),
    }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : ''
  const inferred = parseInferredFields(raw)

  return NextResponse.json(inferred)
}
