'use server'

import { auth, currentUser } from '@clerk/nextjs/server'
import { revalidatePath, updateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import type { Workout } from '@/lib/data'
import {
  dbSetScheduleWorkout,
  dbInsertWorkout,
  dbUpdateWorkout,
  dbDeleteWorkout,
  dbRegroupFamily,
} from '@/lib/db'
import { captureServerEvent } from '@/lib/analytics'

// GitHub Projects v2 node ID for "Running Apps" — every feedback-created issue gets
// linked here so it isn't a floating orphan (see CLAUDE.md "GitHub Project").
const RUNNING_APPS_PROJECT_ID = 'PVT_kwHOAAJdzs4BYmPr'

export async function createFeedbackIssue(data: {
  type: 'bug' | 'feature'
  description: string
  screenshotBase64?: string
  name?: string
  email?: string
}): Promise<{ url: string } | { error: string }> {
  const token = process.env.GITHUB_TOKEN
  if (!token) return { error: 'GitHub token not configured' }

  const { userId } = await auth()
  let submittedBy: string
  if (userId) {
    const user = await currentUser()
    const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ')
    const email = user?.primaryEmailAddress?.emailAddress
    submittedBy = [fullName || 'Leader', email ? `(${email})` : ''].filter(Boolean).join(' ')
  } else if (data.name || data.email) {
    submittedBy = [data.name || 'someone', data.email ? `(${data.email})` : ''].filter(Boolean).join(' ')
  } else {
    submittedBy = 'Anonymous visitor'
  }

  let body = `Submitted by: ${submittedBy}\n\n${data.description}`

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
  const issue = await res.json() as { html_url: string; node_id?: string }

  // Best-effort: link the new issue to the Running Apps project board so it isn't a
  // floating orphan (#179). Runs via after() so it never delays the response the user
  // is waiting on — linking is a nice-to-have, not part of the feedback submission
  // itself. One retry absorbs occasional transient GitHub API failures (observed
  // empirically, ~1 in 18 attempts while diagnosing #179). Failures are reported to
  // Sentry rather than swallowed, so a rising failure rate (e.g. a stale project ID
  // or a token permission change) is discoverable instead of silently recreating #179.
  after(async () => {
    if (!issue.node_id) {
      Sentry.captureMessage('createFeedbackIssue: REST response missing node_id, cannot link to project board', {
        level: 'warning',
        extra: { issueUrl: issue.html_url },
      })
      return
    }

    async function linkToProject() {
      const r = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `mutation($projectId: ID!, $contentId: ID!) {
            addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
              item { id }
            }
          }`,
          variables: { projectId: RUNNING_APPS_PROJECT_ID, contentId: issue.node_id },
        }),
      })
      const json = await r.json() as { errors?: unknown[] }
      if (!r.ok || json.errors) throw new Error(`project link failed: ${r.status} ${JSON.stringify(json.errors)}`)
    }

    try {
      await linkToProject()
    } catch {
      try {
        await new Promise(resolve => setTimeout(resolve, 1000))
        await linkToProject()
      } catch (err) {
        Sentry.captureException(err, { extra: { issueUrl: issue.html_url, projectId: RUNNING_APPS_PROJECT_ID } })
      }
    }
  })

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
  await captureServerEvent('workout_added', { isVariation: false })
  redirect('/library')
}

export async function deleteWorkout(name: string, variation: string) {
  await requireAuth()
  await dbDeleteWorkout(name, variation)
  revalidateAll()
}

export async function updateWorkout(
  original: { name: string; variation: string; hasTurnaround: boolean; turnaroundDistance: string },
  formData: FormData,
) {
  await requireAuth()
  const variation = (formData.get('variation') as string) ?? ''
  const progression = (formData.get('progression') as string) ?? ''
  const updated = buildWorkout(formData, variation, progression)

  const turnaroundChanged =
    original.hasTurnaround !== updated.hasTurnaround || original.turnaroundDistance !== updated.turnaroundDistance

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
  await captureServerEvent('workout_added', { isVariation: true })
  redirect('/library')
}
