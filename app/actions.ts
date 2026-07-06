'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath, updateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import type { Workout } from '@/lib/data'
import {
  fetchWorkouts,
  dbSetScheduleWorkout,
  dbInsertWorkout,
  dbUpdateWorkout,
  dbDeleteWorkout,
  dbRegroupFamily,
} from '@/lib/db'
import { captureServerEvent } from '@/lib/analytics'

export async function createFeedbackIssue(data: {
  type: 'bug' | 'feature'
  description: string
  screenshotBase64?: string
}): Promise<{ url: string } | { error: string }> {
  const token = process.env.GITHUB_TOKEN
  if (!token) return { error: 'GitHub token not configured' }

  let body = data.description

  if (data.screenshotBase64) {
    try {
      const Anthropic = (await import('@anthropic-ai/sdk')).default
      const client = new Anthropic()
      const visionReply = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: data.screenshotBase64 } },
            { type: 'text', text: 'Describe what you see in this screenshot from a run club workout app in 2-3 sentences. Focus on what UI element or state is shown, and any visible problem if this is a bug report.' },
          ],
        }],
      })
      const screenshotDesc = visionReply.content[0].type === 'text' ? visionReply.content[0].text : ''
      body = `${data.description}\n\n**Screenshot:** ${screenshotDesc}`
    } catch {
      // Vision analysis failed — submit without screenshot context
    }
  }

  const label = data.type === 'bug' ? 'bug' : 'enhancement'
  const maxTitleLen = 60
  const rawTitle = `${data.type === 'bug' ? 'Bug' : 'Feature'}: ${data.description}`
  const title = rawTitle.length > maxTitleLen ? rawTitle.slice(0, maxTitleLen) + '…' : rawTitle

  const res = await fetch('https://api.github.com/repos/foulox/tigerwolves/issues', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title, body, labels: [label] }),
  })

  if (!res.ok) return { error: `GitHub API error: ${res.status}` }
  const issue = await res.json() as { html_url: string }
  return { url: issue.html_url }
}

function buildWorkout(formData: FormData, variation = '', progression = ''): Omit<Workout, 'lastRan'> {
  const progressionNum = parseInt(progression)
  return {
    name: formData.get('name') as string,
    sport: 'Running',
    category: formData.get('category') as string,
    type: formData.get('type') as string,
    reason: formData.get('reason') as string,
    instructions: formData.get('instructions') as string,
    distTime: formData.get('distTime') as string,
    lapStructure: formData.get('lapStructure') as string,
    energySystem: formData.get('energySystem') as string,
    hrZone: formData.get('hrZone') as string,
    rpe: formData.get('rpe') as string,
    coachingNotes: (formData.get('coachingNotes') as string) || null,
    mapLink: (formData.get('mapLink') as string) || null,
    variation,
    progression: isNaN(progressionNum) ? null : progressionNum,
    author: (formData.get('author') as string) || null,
    raceTypes: ((formData.get('raceTypes') as string) || '').split(',').map(s => s.trim()).filter(Boolean),
    trainingPhases: ((formData.get('trainingPhases') as string) || '').split(',').map(s => s.trim()).filter(Boolean),
    hasTurnaround: (formData.get('hasTurnaround') as string) === 'true',
    turnaroundDistance: (formData.get('turnaroundDistance') as string) || '',
  }
}

async function requireAuth() {
  const { userId } = await auth()
  if (!userId) throw new Error('Unauthorized')
}

function revalidateAll() {
  revalidatePath('/', 'layout')
  updateTag('tigerwolves-data')
}

export async function setPlanWorkout(date: string, workoutName: string) {
  await requireAuth()
  await dbSetScheduleWorkout(date, workoutName)
  revalidateAll()
  await captureServerEvent('schedule_workout_set')
}

export async function regroupFamily(
  newName: string,
  workouts: Array<{
    originalName: string
    originalVariation: string
    variation: string
    progression: number
  }>
) {
  await requireAuth()
  await dbRegroupFamily(newName, workouts)
  revalidateAll()
  await captureServerEvent('workouts_combined')
  redirect('/library')
}

export async function addWorkout(formData: FormData) {
  await requireAuth()
  await dbInsertWorkout(buildWorkout(formData))
  revalidateAll()
  await captureServerEvent('workout_added')
  redirect('/library')
}

export async function deleteWorkout(name: string, variation: string) {
  await requireAuth()
  await dbDeleteWorkout(name, variation)
  revalidateAll()
}

export async function updateWorkout(
  original: { name: string; variation: string },
  formData: FormData,
) {
  await requireAuth()
  const variation = (formData.get('variation') as string) ?? ''
  const progression = (formData.get('progression') as string) ?? ''
  const updated = buildWorkout(formData, variation, progression)

  const existing = (await fetchWorkouts()).find(
    w => w.name === original.name && w.variation === original.variation
  )
  const turnaroundChanged = existing
    ? existing.hasTurnaround !== updated.hasTurnaround || existing.turnaroundDistance !== updated.turnaroundDistance
    : false

  await dbUpdateWorkout(original.name, original.variation, updated)
  revalidateAll()
  await captureServerEvent('workout_edited', { turnaroundChanged })
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
  await requireAuth()
  await dbInsertWorkout({
    name: parent.name,
    sport: 'Running',
    category: parent.category,
    type: parent.type,
    reason: parent.reason,
    instructions,
    distTime,
    lapStructure: parent.lapStructure,
    energySystem: parent.energySystem,
    hrZone: parent.hrZone,
    rpe: parent.rpe,
    coachingNotes: parent.coachingNotes,
    mapLink: parent.mapLink,
    variation,
    progression,
    author: parent.author,
    raceTypes: parent.raceTypes,
    trainingPhases: parent.trainingPhases,
    hasTurnaround: false,
    turnaroundDistance: '',
  })
  revalidateAll()
  await captureServerEvent('workout_added')
  redirect('/library')
}
