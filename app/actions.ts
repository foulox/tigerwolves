'use server'

import { auth, currentUser } from '@clerk/nextjs/server'
import { revalidatePath, updateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { isValidDateString } from '@/lib/data'
import {
  dbSetScheduleWorkout,
  dbInsertRace,
  dbFlagRace,
  dbVerifyRace,
  dbFixRace,
  dbInsertWorkoutVariant,
  dbUpdateWorkoutVariant,
  dbAddWorkoutVariant,
  dbDeleteWorkoutVariant,
  dbFlagWorkoutVariant,
  dbFixWorkoutVariantAndClearFlag,
  dbRegroupVariants,
  WorkoutVariantNotFoundError,
} from '@/lib/db'
import { buildWorkoutVariantInput } from '@/lib/workoutVariant'
import { captureServerEvent } from '@/lib/analytics'
import { feedbackLabel, feedbackTitle, feedbackBody, type FeedbackType } from '@/lib/feedbackUtils'

// GitHub Projects v2 node ID for "Running Apps" — every feedback-created issue gets
// linked here so it isn't a floating orphan (see CLAUDE.md "GitHub Project").
const RUNNING_APPS_PROJECT_ID = 'PVT_kwHOAAJdzs4BYmPr'

export async function createFeedbackIssue(data: {
  type: FeedbackType
  description: string
  workoutContext?: string
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

  let body = feedbackBody(data.type, data.description, submittedBy, data.workoutContext)

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
      body = `${body}\n\n**Screenshot:** ${screenshotDesc}`
    } catch {
      // Vision analysis failed — submit without screenshot context
    }
  }

  const label = feedbackLabel(data.type)
  const title = feedbackTitle(data.type, data.description, data.workoutContext)

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

  await captureServerEvent('feedback_submitted', userId ?? 'anonymous-runner', {
    type: data.type,
    hasScreenshot: !!data.screenshotBase64,
    isLeader: !!userId,
  })

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

async function requireAuth(): Promise<string> {
  const { userId } = await auth()
  if (!userId) throw new Error('Unauthorized')
  return userId
}

function revalidateAll() {
  revalidatePath('/', 'layout')
  updateTag('tigerwolves-data')
}

export async function setPlanWorkout(date: string, workoutName: string, selectedVariations: string[]) {
  const userId = await requireAuth()
  await dbSetScheduleWorkout(date, workoutName, selectedVariations)
  revalidateAll()
  await captureServerEvent('schedule_workout_set', userId, { isLeader: true })
}

export async function regroupFamily(
  newName: string,
  variants: Array<{ variantId: number; label: string; sortOrder: number }>,
) {
  const userId = await requireAuth()
  await dbRegroupVariants(newName, variants)
  revalidateAll()
  await captureServerEvent('workouts_combined', userId, { isLeader: true })
  redirect('/library')
}

export async function addWorkout(formData: FormData) {
  const userId = await requireAuth()
  await dbInsertWorkoutVariant(buildWorkoutVariantInput(formData))
  revalidateAll()
  await captureServerEvent('workout_added', userId, { isVariation: false, isLeader: true })
  redirect('/library')
}

export async function deleteWorkout(variantId: number) {
  const userId = await requireAuth()
  await dbDeleteWorkoutVariant(variantId)
  revalidateAll()
  await captureServerEvent('workout_deleted', userId, { isLeader: true })
}

export async function updateWorkout(variantId: number, formData: FormData) {
  const userId = await requireAuth()
  await dbUpdateWorkoutVariant(variantId, buildWorkoutVariantInput(formData))
  revalidateAll()
  await captureServerEvent('workout_edited', userId, { isLeader: true })
  redirect('/library')
}

export async function flagWorkoutIssue(variantId: number, note: string): Promise<void | { error: string }> {
  const trimmed = note.trim()
  if (!trimmed) return { error: 'Description is required' }
  try {
    await dbFlagWorkoutVariant(variantId, trimmed)
  } catch (err) {
    if (err instanceof WorkoutVariantNotFoundError) {
      return { error: 'This workout may have changed since you opened this page — refresh and try again.' }
    }
    throw err
  }
  revalidateAll()
  const { userId } = await auth()
  await captureServerEvent('workout_flagged', userId ?? 'anonymous-runner', { isLeader: !!userId })
}

export async function fixWorkoutAndClearFlag(
  variantId: number,
  fields: { reason: string; distTime: string; instructions: string },
): Promise<void | { error: string }> {
  const userId = await requireAuth()
  const reason = fields.reason.trim()
  if (!reason) return { error: 'Reason is required' }

  try {
    await dbFixWorkoutVariantAndClearFlag(variantId, {
      reason,
      distTime: fields.distTime.trim(),
      instructions: fields.instructions.trim(),
    })
  } catch (err) {
    if (err instanceof WorkoutVariantNotFoundError) {
      return { error: 'This workout may have changed since you opened this page — refresh and try again.' }
    }
    throw err
  }
  revalidateAll()
  await captureServerEvent('workout_fixed', userId, { isLeader: true })
}

export async function addRace(data: {
  name: string
  date: string
  distance: string
  location: string
  organizer: string
}): Promise<{ id: number } | { error: string }> {
  const name = data.name.trim()
  const date = data.date.trim()
  if (!name) return { error: 'Race name is required' }
  if (!date) return { error: 'Date is required' }
  if (!isValidDateString(date)) return { error: 'Enter a valid date' }

  const id = await dbInsertRace({
    date,
    name,
    distance: data.distance.trim(),
    location: data.location.trim(),
    organizer: data.organizer.trim() || 'a club member',
    verified: false,
    flagged: false,
    flagNote: '',
  })
  revalidateAll()
  const { userId } = await auth()
  await captureServerEvent('race_added', userId ?? 'anonymous-runner', { isLeader: !!userId })
  return { id }
}

export async function flagRaceIssue(raceId: number, note: string): Promise<void | { error: string }> {
  const trimmed = note.trim()
  if (!trimmed) return { error: 'Description is required' }
  await dbFlagRace(raceId, trimmed)
  revalidateAll()
  const { userId } = await auth()
  await captureServerEvent('race_flagged', userId ?? 'anonymous-runner', { raceId, isLeader: !!userId })
}

export async function verifyRace(raceId: number) {
  const userId = await requireAuth()
  await dbVerifyRace(raceId)
  revalidateAll()
  await captureServerEvent('race_verified', userId, { raceId, isLeader: true })
}

export async function fixRaceAndClearFlag(
  raceId: number,
  fields: { name: string; date: string; distance: string; location: string },
): Promise<void | { error: string }> {
  const userId = await requireAuth()
  const name = fields.name.trim()
  const date = fields.date.trim()
  if (!name) return { error: 'Race name is required' }
  if (!date) return { error: 'Date is required' }
  if (!isValidDateString(date)) return { error: 'Enter a valid date' }

  await dbFixRace(raceId, { name, date, distance: fields.distance.trim(), location: fields.location.trim() })
  revalidateAll()
  await captureServerEvent('race_fixed', userId, { raceId, isLeader: true })
}

// Adds a variant to an existing family — the workout_variants counterpart to
// addWorkout above. Inherits energySystem/hrZone/rpe/raceTypes/trainingPhases
// from the parent (base) variant, same as the legacy version did; turnaround
// always starts unset for a new variation, same as before.
export async function addVariation(
  parent: {
    familyId: number
    energySystem: string; hrZone: string; rpe: string;
    raceTypes: string[]; trainingPhases: string[];
  },
  label: string,
  sortOrder: number,
  instructions: string,
  distTime: string,
) {
  const userId = await requireAuth()
  await dbAddWorkoutVariant(parent.familyId, {
    label,
    sortOrder,
    instructions,
    distTime,
    energySystem: parent.energySystem,
    hrZone: parent.hrZone,
    rpe: parent.rpe,
    raceTypes: parent.raceTypes,
    trainingPhases: parent.trainingPhases,
    hasTurnaround: false,
    turnaround: '',
  })
  revalidateAll()
  await captureServerEvent('workout_added', userId, { isVariation: true, isLeader: true })
  redirect('/library')
}
