import { z } from 'zod'
import { FORM_CATEGORIES, TYPES_BY_CATEGORY } from './workoutForm'

// #271 decision: workout_families.type stays TEXT in the DB (no Postgres enum,
// so new types don't need a migration) with enforcement pushed to the write path.
export const WorkoutVariantInputSchema = z.object({
  name: z.string().min(1),
  category: z.enum(FORM_CATEGORIES),
  // #473: the valid type vocabulary depends on the category (TYPES_BY_CATEGORY, #347):
  // Quality has the rich structure set; Easy/Long use 'Easy'/'Long'. A plain enum of
  // the Quality types rejected every Easy/Long save, so validate against the category
  // in the superRefine below instead.
  type: z.string(),
  reason: z.string(),
  // #469: required only for Quality workouts (enforced in the superRefine below);
  // Easy/Long may be just a route + distance, so a blank is allowed there.
  instructions: z.string(),
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
  // Variant-level rename fields (#277) — dbInsertWorkoutVariant ignores these
  // (a brand-new family's sole variant is always the null/null singleton);
  // dbUpdateWorkoutVariant writes them, so editing a family member's label/
  // ordering no longer silently drops the change.
  label: z.string().nullable(),
  sortOrder: z.number().nullable(),
  // #457: route metric fields — persisted on workout_families, nullable
  distanceMiles: z.number().nullable(),
  elevationGainFeet: z.number().nullable(),
  geometry: z.unknown().nullable(),
}).superRefine((val, ctx) => {
  // #473: the type must be valid for the selected category (TYPES_BY_CATEGORY, #347).
  if (!TYPES_BY_CATEGORY[val.category]?.includes(val.type)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['type'],
      message: `"${val.type}" is not a valid type for a ${val.category} workout.`,
    })
  }
  // #469: Instructions are required only for Quality workouts (where the workout
  // structure is the whole point). Easy/Long runs are often just "run N miles on
  // this route", so a blank is allowed for them.
  if (val.category === 'Quality' && val.instructions.trim() === '') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['instructions'],
      message: 'Instructions are required for Quality workouts.',
    })
  }
})

export type WorkoutVariantInput = z.infer<typeof WorkoutVariantInputSchema>

export function buildWorkoutVariantInput(formData: FormData): WorkoutVariantInput {
  const runGroupIdRaw = formData.get('runGroupId') as string
  const sortOrderRaw = formData.get('sortOrder') as string
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
    label: (formData.get('label') as string) || null,
    sortOrder: sortOrderRaw ? Number(sortOrderRaw) : null,
    // #457: route metrics
    distanceMiles: (() => { const raw = (formData.get('distanceMiles') ?? '') as string; return raw !== '' && !Number.isNaN(Number(raw)) ? Number(raw) : null })(),
    elevationGainFeet: (() => { const raw = (formData.get('elevationGainFeet') ?? '') as string; return raw !== '' && !Number.isNaN(Number(raw)) ? Number(raw) : null })(),
    geometry: (() => { const raw = formData.get('geometry') as string; return raw ? JSON.parse(raw) : null })(),
  })
}
