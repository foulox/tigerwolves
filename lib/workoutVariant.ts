import { z } from 'zod'
import { FORM_CATEGORIES, FORM_TYPES } from './workoutForm'

// #271 decision: workout_families.type stays TEXT in the DB (no Postgres enum,
// so new types don't need a migration) with enforcement pushed to the write path.
export const WorkoutVariantInputSchema = z.object({
  name: z.string().min(1),
  category: z.enum(FORM_CATEGORIES),
  type: z.enum(FORM_TYPES),
  reason: z.string(),
  instructions: z.string().min(1),
  distTime: z.string(),
  energySystem: z.string(),
  hrZone: z.string(),
  rpe: z.string(),
  raceTypes: z.array(z.string()),
  trainingPhases: z.array(z.string()),
  author: z.string().nullable(),
  coachingNotes: z.string().nullable(),
  mapLink: z.string().nullable(),
  runGroupId: z.number().nullable(),
  hasTurnaround: z.boolean(),
  turnaround: z.string(),
})

export type WorkoutVariantInput = z.infer<typeof WorkoutVariantInputSchema>

export function buildWorkoutVariantInput(formData: FormData): WorkoutVariantInput {
  const runGroupIdRaw = formData.get('runGroupId') as string
  return WorkoutVariantInputSchema.parse({
    name: formData.get('name'),
    category: formData.get('category'),
    type: formData.get('type'),
    reason: formData.get('reason'),
    instructions: formData.get('instructions'),
    distTime: formData.get('distTime'),
    energySystem: formData.get('energySystem'),
    hrZone: formData.get('hrZone'),
    rpe: formData.get('rpe'),
    raceTypes: ((formData.get('raceTypes') as string) || '').split(',').map(s => s.trim()).filter(Boolean),
    trainingPhases: ((formData.get('trainingPhases') as string) || '').split(',').map(s => s.trim()).filter(Boolean),
    author: (formData.get('author') as string) || null,
    coachingNotes: (formData.get('coachingNotes') as string) || null,
    mapLink: (formData.get('mapLink') as string) || null,
    runGroupId: runGroupIdRaw ? Number(runGroupIdRaw) : null,
    hasTurnaround: (formData.get('hasTurnaround') as string) === 'true',
    turnaround: (formData.get('turnaround') as string) || '',
  })
}
