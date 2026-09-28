import Anthropic from '@anthropic-ai/sdk'
import type { DirectionsInput } from './types'
import { buildDirectionsPrompt } from './prompt'

const client = new Anthropic()

export async function composeNarrative(input: DirectionsInput): Promise<string> {
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    messages: [{ role: 'user', content: buildDirectionsPrompt(input) }],
  })
  return message.content[0].type === 'text' ? message.content[0].text.trim() : ''
}
