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

export async function addWorkout(formData: FormData) {
  const payload = {
    'Workout Name': formData.get('name') as string,
    'Sport': 'Running',
    'Category': formData.get('category') as string,
    'Type': formData.get('type') as string,
    'Reason / Purpose': formData.get('reason') as string,
    'Instructions': formData.get('instructions') as string,
    'Dist/Time': formData.get('distTime') as string,
    'Lap Structure': '',
    'Energy System': '',
    'HR Zone': '',
    'RPE': '',
    'Last Ran': '',
    'Coaching Notes': '',
    'Map Link': '',
  }

  const res = await fetch(process.env.SHEETS_URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const json = await res.json()
  if (!json.ok) throw new Error(json.error ?? 'Save failed')

  revalidatePath('/library')
  redirect('/library')
}
