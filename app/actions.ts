'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function setPlanWorkout(date: string, workoutName: string) {
  const res = await fetch(process.env.SHEETS_URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'setScheduleWorkout', date, workoutName }),
  })
  const json = await res.json()
  if (!json.ok) throw new Error(json.error ?? 'Save failed')
  revalidatePath('/')
}

function buildPayload(formData: FormData, variation = '', progression = '') {
  return {
    'Workout Name': formData.get('name') as string,
    'Sport': 'Running',
    'Category': formData.get('category') as string,
    'Type': formData.get('type') as string,
    'Reason / Purpose': formData.get('reason') as string,
    'Instructions': formData.get('instructions') as string,
    'Dist/Time': formData.get('distTime') as string,
    'Lap Structure': formData.get('lapStructure') as string,
    'Energy System': formData.get('energySystem') as string,
    'HR Zone': formData.get('hrZone') as string,
    'RPE': formData.get('rpe') as string,
    'Last Ran': '',
    'Coaching Notes': formData.get('coachingNotes') as string,
    'Map Link': formData.get('mapLink') as string,
    'Author': formData.get('author') as string,
    'Race Type': formData.get('raceTypes') as string,
    'Training Phase': formData.get('trainingPhases') as string,
    'Variation': variation,
    'Progression': progression,
  }
}

async function postToSheet(payload: Record<string, string>) {
  const res = await fetch(process.env.SHEETS_URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const json = await res.json()
  if (!json.ok) throw new Error(json.error ?? 'Save failed')
}

export async function addWorkout(formData: FormData) {
  await postToSheet(buildPayload(formData))
  revalidatePath('/library')
  redirect('/library')
}

export async function addWorkoutFamily(formData: FormData, variations: string[]) {
  for (let i = 0; i < variations.length; i++) {
    await postToSheet(buildPayload(formData, variations[i], String(i + 1)))
  }
  revalidatePath('/library')
  redirect('/library')
}

export async function addVariation(
  parent: {
    name: string; category: string; type: string; reason: string;
    lapStructure: string; energySystem: string; hrZone: string; rpe: string;
    coachingNotes: string | null; mapLink: string | null; author: string | null;
    raceTypes: string[]; trainingPhases: string[];
  },
  variation: string,
  progression: number,
  instructions: string,
  distTime: string,
) {
  await postToSheet({
    'Workout Name': parent.name,
    'Sport': 'Running',
    'Category': parent.category,
    'Type': parent.type,
    'Reason / Purpose': parent.reason,
    'Instructions': instructions,
    'Dist/Time': distTime,
    'Lap Structure': parent.lapStructure,
    'Energy System': parent.energySystem,
    'HR Zone': parent.hrZone,
    'RPE': parent.rpe,
    'Last Ran': '',
    'Coaching Notes': parent.coachingNotes ?? '',
    'Map Link': parent.mapLink ?? '',
    'Author': parent.author ?? '',
    'Race Type': parent.raceTypes.join(', '),
    'Training Phase': parent.trainingPhases.join(', '),
    'Variation': variation,
    'Progression': String(progression),
  })
  revalidatePath('/library')
  redirect('/library')
}
