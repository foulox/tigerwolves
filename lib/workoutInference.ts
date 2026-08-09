import { z } from 'zod'

export const InferredFieldsSchema = z.object({
  distTime: z.string(),
  energySystem: z.string(),
  hrZone: z.string(),
  rpe: z.string(),
  raceTypes: z.array(z.string()),
  trainingPhases: z.array(z.string()),
  author: z.string(),
  coachingNotes: z.string(),
  hasTurnaround: z.boolean(),
  turnaround: z.string(),
})

export type InferredFields = z.infer<typeof InferredFieldsSchema>

// The model sometimes wraps its JSON reply in a markdown code fence despite
// being told not to — strip that before parsing, same as the pre-#274 behavior.
export function parseInferredFields(raw: string): InferredFields {
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  return InferredFieldsSchema.parse(JSON.parse(text))
}
