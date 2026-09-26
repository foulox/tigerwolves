'use server'

import { currentUser } from '@clerk/nextjs/server'
import { revalidatePath, updateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { isValidDateString } from '@/lib/data'
import {
  sql,
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
  getLeaderRun,
  getRunById,
  dbAdoptRoute,
  dbUnadoptRoute,
  leaderLeadsRun,
  getWorkoutFamilyMeta,
} from '@/lib/db'
import { isRouteAdoptable } from '@/lib/runProfile'
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

  const user = await currentUser()
  const userId = user?.id
  let submittedBy: string
  if (userId) {
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

  const isLeaderFeedback = user?.publicMetadata?.role === 'leader'
  await captureServerEvent('feedback_submitted', userId ?? 'anonymous-runner', {
    type: data.type,
    hasScreenshot: !!data.screenshotBase64,
    isLeader: isLeaderFeedback,
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
  const user = await currentUser()
  if (!user || user.publicMetadata?.role !== 'leader') throw new Error('Unauthorized')
  return user.id
}

// #404 (review): a route delete is GLOBAL — it removes the one canonical
// workout_families row for every run that uses it. That's too sharp for any leader
// to fire; it's gated to the cross-run admin (`publicMetadata.admin === true`, the
// same flag requireAdminPage / isAdminUser use). Other leaders un-adopt ("Remove
// from my run") and request a real delete out-of-band. Defense-in-depth behind the
// UI, which only shows the Delete button to admins.
async function requireAdmin(): Promise<string> {
  const user = await currentUser()
  if (!user || user.publicMetadata?.admin !== true) throw new Error('Unauthorized')
  return user.id
}

// Any signed-in user (runner OR leader) — the follow surfaces are open to every
// authenticated account, unlike requireAuth() which gates leader-only writes.
async function requireUser(): Promise<string> {
  const user = await currentUser()
  if (!user) throw new Error('Unauthorized')
  return user.id
}

function revalidateAll() {
  revalidatePath('/', 'layout')
  updateTag('tigerwolves-data')
}

export async function setPlanWorkout(date: string, workoutName: string, selectedVariations: string[]) {
  const userId = await requireAuth()
  // Resolve the caller's run server-side (never trust a client-supplied runId) and
  // scope the write to it — schedule rows are keyed by (date, run_id) since #310.
  const run = await getLeaderRun(userId)
  if (!run) throw new Error('Forbidden')
  await dbSetScheduleWorkout(date, run.id, workoutName, selectedVariations)
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
  const { familyId } = await dbInsertWorkoutVariant(buildWorkoutVariantInput(formData))
  // #404: the creating run auto-joins its own library — a brand-new route must appear
  // in "Your run," not only "All runs." Membership is the single visibility source now,
  // so without this the workout would be invisible to the run that just created it.
  const run = await getLeaderRun(userId)
  if (run) await dbAdoptRoute(run.id, familyId)
  revalidateAll()
  await captureServerEvent('workout_added', userId, { isVariation: false, isLeader: true })
  redirect('/library')
}

export async function deleteWorkout(variantId: number) {
  const userId = await requireAdmin()
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
  const user = await currentUser()
  const userId = user?.id
  const isLeader = user?.publicMetadata?.role === 'leader'
  await captureServerEvent('workout_flagged', userId ?? 'anonymous-runner', { isLeader })
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
    organizer: data.organizer.trim(),
    verified: false,
    flagged: false,
    flagNote: '',
  })
  revalidateAll()
  const user = await currentUser()
  const userId = user?.id
  const isLeader = user?.publicMetadata?.role === 'leader'
  await captureServerEvent('race_added', userId ?? 'anonymous-runner', { isLeader })
  return { id }
}

export async function flagRaceIssue(raceId: number, note: string): Promise<void | { error: string }> {
  const trimmed = note.trim()
  if (!trimmed) return { error: 'Description is required' }
  await dbFlagRace(raceId, trimmed)
  revalidateAll()
  const user = await currentUser()
  const userId = user?.id
  const isLeader = user?.publicMetadata?.role === 'leader'
  await captureServerEvent('race_flagged', userId ?? 'anonymous-runner', { raceId, isLeader })
}

export async function verifyRace(raceId: number) {
  const userId = await requireAuth()
  await dbVerifyRace(raceId)
  revalidateAll()
  await captureServerEvent('race_verified', userId, { raceId, isLeader: true })
}

export async function fixRaceAndClearFlag(
  raceId: number,
  fields: { name: string; date: string; distance: string; location: string; organizer: string },
): Promise<void | { error: string }> {
  const userId = await requireAuth()
  const name = fields.name.trim()
  const date = fields.date.trim()
  if (!name) return { error: 'Race name is required' }
  if (!date) return { error: 'Date is required' }
  if (!isValidDateString(date)) return { error: 'Enter a valid date' }

  await dbFixRace(raceId, { name, date, distance: fields.distance.trim(), location: fields.location.trim(), organizer: fields.organizer.trim() })
  revalidateAll()
  await captureServerEvent('race_fixed', userId, { raceId, isLeader: true })
}

export async function saveScheduleLeader(date: string, leader: string): Promise<void> {
  try {
    const user = await currentUser()
    if (!user || user.publicMetadata?.role !== 'leader') throw new Error('Unauthorized')
    // Verify the schedule entry belongs to the caller's run
    const run = await getLeaderRun(user.id)
    if (!run) throw new Error('Forbidden')
    const entryRows = await sql`SELECT run_id FROM schedule WHERE date = ${date}::date AND run_id = ${run.id}`
    if (!entryRows[0]) throw new Error('Forbidden')
    await sql`UPDATE schedule SET leader = ${leader}, needs_leader = null WHERE date = ${date}::date AND run_id = ${run.id}`
    updateTag('tigerwolves-data')
    await captureServerEvent('schedule_leader_changed', user.id, { date, leader })
  } catch (err) {
    Sentry.captureException(err)
    throw err
  }
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

// #330: follow / unfollow a run. Open to any signed-in user (runners follow;
// leaders follow other runs too — the superset model). Writes runner_follows and
// invalidates the data cache so All Runs / My Week read-your-own-write. Only an
// existing platform run can be followed, so a follow never dangles.
export async function toggleRunFollow(runId: string): Promise<{ error?: string; following?: boolean }> {
  try {
    const userId = await requireUser()
    const run = await getRunById(runId)
    if (!run) return { error: 'Run not found' }

    const existing = await sql`
      SELECT 1 FROM runner_follows
      WHERE clerk_user_id = ${userId} AND run_id = ${runId} LIMIT 1
    `
    let following: boolean
    if (existing.length > 0) {
      await sql`DELETE FROM runner_follows WHERE clerk_user_id = ${userId} AND run_id = ${runId}`
      following = false
    } else {
      // A draft run is visible but not joinable to the public: only its owning
      // leader OR an admin may follow it (leaders trial their run pre-launch;
      // admins manage any draft). Mirrors cardAffordance's canManage — the client
      // shows the Join button under the same condition, so this must match it.
      if (run.status === 'draft') {
        const user = await currentUser()
        const isAdmin = user?.publicMetadata?.admin === true
        const leaderRun = await getLeaderRun(userId)
        if (!isAdmin && leaderRun?.id !== runId) {
          return { error: "This run isn't open to join yet" }
        }
      }
      await sql`
        INSERT INTO runner_follows (clerk_user_id, run_id)
        VALUES (${userId}, ${runId})
        ON CONFLICT (clerk_user_id, run_id) DO NOTHING
      `
      following = true
    }
    updateTag('tigerwolves-data')
    return { following }
  } catch (err) {
    if (err instanceof Error && err.message === 'Unauthorized') return { error: 'Unauthorized' }
    Sentry.captureException(err)
    return { error: 'Failed to update follow status' }
  }
}

// #404: adopt a route into a run the caller leads — adds a run_workouts membership
// row so the route appears in that run's "Your run" library and Schedule picker,
// from the same canonical definition (a reference, never a copy). Leader-only
// (requireAuth), and the target run MUST be one the caller actively leads (AC8) —
// a leader can never add routes to a run they don't lead. Idempotent at the DB
// layer, so a double-tap is harmless.
export async function adoptRoute(runId: string, familyId: number): Promise<{ error?: string }> {
  try {
    const userId = await requireAuth()
    if (!(await leaderLeadsRun(userId, runId))) return { error: 'You can only add routes to a run you lead' }
    // #412: cross-type adoption guard — resolve both the target run and the workout
    // family, then reject if the family's type doesn't fit the run. Runs before the
    // DB write so no row is ever committed for an off-type combination.
    const [run, family] = await Promise.all([getRunById(runId), getWorkoutFamilyMeta(familyId)])
    if (!run || !family) return { error: 'Route or run not found' }
    if (!isRouteAdoptable({ category: family.category, type: family.type }, { kind: run.kind, workoutTypes: run.workoutTypes })) {
      return { error: "This route's type doesn't fit that run — you can borrow it for a week instead." }
    }
    await dbAdoptRoute(runId, familyId)
    revalidateAll()
    return {}
  } catch (err) {
    if (err instanceof Error && err.message === 'Unauthorized') return { error: 'Unauthorized' }
    Sentry.captureException(err)
    return { error: 'Failed to add route to your run' }
  }
}

// #404: un-adopt (Remove from my run) — drops this run's membership row only. The
// canonical route and every other run's membership are untouched; this is NOT a
// global delete (that's deleteWorkout). Same lead-the-run authz as adoptRoute.
export async function unadoptRoute(runId: string, familyId: number): Promise<{ error?: string }> {
  try {
    const userId = await requireAuth()
    if (!(await leaderLeadsRun(userId, runId))) return { error: 'You can only remove routes from a run you lead' }
    await dbUnadoptRoute(runId, familyId)
    revalidateAll()
    return {}
  } catch (err) {
    if (err instanceof Error && err.message === 'Unauthorized') return { error: 'Unauthorized' }
    Sentry.captureException(err)
    return { error: 'Failed to remove route from your run' }
  }
}
