import { z } from 'zod'
import { RACE_TYPES, TRAINING_PHASES } from './data'
import { fieldDescription } from './schemaSemantics'

export type InferPromptInput = {
  name: string
  category: string
  type: string
  instructions: string
  reason: string
  venue: string | null | undefined
  hasTurnaroundHint: boolean
}

// Used by the write-path route (app/api/workout/infer/route.ts, #274) to
// suggest a workout's `turnaround` text from its instructions.
export function buildInferPrompt(input: InferPromptInput): string {
  const { name, category, type, instructions, reason, venue, hasTurnaroundHint } = input
  return `You are a running coach assistant. Given a workout's basic details, infer the missing training metadata.

Workout:
Name: ${name}
Category: ${category}
Type: ${type}
Instructions: ${instructions}
Purpose: ${reason}
Run group venue: ${venue ?? 'unspecified'}
Leader's initial guess on turnaround: ${hasTurnaroundHint ? 'yes, this workout probably needs one' : 'no, probably doesn\'t need one'} — treat this as a signal, not a rule; they filled this in before seeing the instructions parsed back to them, so overrule it if the instructions clearly say otherwise.

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
- turnaround: ${fieldDescription('workout_variants', 'turnaround')} Empty string if hasTurnaround is false. If true, work it out step by step:
  1. Sum the total work time of the MAIN portion only (ignore warm-up/cool-down) — every rep/segment across every set, in seconds or minutes.
  2. Find the cumulative halfway point of that total.
  3. Walk through the structure in order, adding up elapsed time, until you find the exact single segment where the cumulative time crosses the halfway point.
  4. Describe that ONE specific moment precisely (e.g. "Partway through the 2nd set, during the tempo segment" or "After the 2nd of 4 reps"). Never describe something that repeats every set/rep — a turnaround happens exactly once, at one point in the whole workout, not at the same relative spot within each set.

  Worked example: "3 sets of (5min below tempo, 5min at tempo, 5min above tempo), 2min rest between sets" — main-portion total is 3×15 + 2×2 = 49min, halfway is 24.5min. Cumulative: set 1 ends at 15min, rest ends at 17min, set 2's below-tempo segment ends at 22min, set 2's at-tempo segment ends at 27min. 24.5min falls inside that at-tempo segment. Correct answer: "Partway through the 2nd set, during the at-tempo (middle) segment." Wrong answer: anything that says "after the first sub-tempo segment of each set" — that's not a single moment.

Return ONLY valid JSON, no explanation or markdown.`
}

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
