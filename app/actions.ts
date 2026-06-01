'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

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

async function postToSheet(payload: Record<string, unknown>) {
  const res = await fetch(process.env.SHEETS_URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const json = await res.json()
  if (!json.ok) throw new Error(json.error ?? 'Save failed')
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
  const res = await fetch(process.env.SHEETS_URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'regroupFamily', newName, workouts }),
  })
  const json = await res.json()
  if (!json.ok) throw new Error(json.error ?? 'Save failed')
  revalidatePath('/library')
  redirect('/library')
}

export async function addWorkout(formData: FormData) {
  await postToSheet(buildPayload(formData))
  revalidatePath('/library')
  revalidatePath('/admin')
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
