'use server'
import { currentUser } from '@clerk/nextjs/server'
import { updateTag } from 'next/cache'
import * as Sentry from '@sentry/nextjs'
import { sql, resolveOrCreateRunGroup } from '@/lib/db'
import { RUN_KINDS, NBR_CATEGORY_TO_KIND, NBRCategory } from '@/lib/runProfile'
import { slugifyRunName } from '@/lib/runIdentity'

// Private helper — no admin gate, no cache invalidation. Inserts a catalog row
// with the given status; callers own auth + updateTag.
async function insertRun(
  data: { name: string; dayOfWeek: string; meetingTime: string; meetingLocation: string; distance: string; kind: string },
  status: 'unclaimed' | 'draft',
): Promise<{ error?: string; runId?: string }> {
  const name = data.name.trim()
  if (!name) return { error: 'Name is required' }
  if (!(RUN_KINDS as readonly string[]).includes(data.kind)) return { error: 'Invalid run kind' }

  // Case-insensitive display-name uniqueness (distinct from slug collision below).
  const dup = await sql`SELECT 1 FROM runs WHERE LOWER(name) = LOWER(${name}) LIMIT 1`
  if (dup.length > 0) return { error: 'A run with this name already exists' }

  // Slug: base from name; probe and suffix -2, -3, … until free.
  const base = slugifyRunName(name) || 'run'
  let candidate = base
  let suffix = 2
  for (;;) {
    const existing = await sql`SELECT 1 FROM runs WHERE id = ${candidate}`
    if (existing.length === 0) break
    candidate = `${base}-${suffix}`
    suffix++
  }

  await sql`
    INSERT INTO runs (id, name, day_of_week, meeting_time, meeting_location, kind, distance, status)
    VALUES (${candidate}, ${name}, ${data.dayOfWeek}, ${data.meetingTime}, ${data.meetingLocation}, ${data.kind}, ${data.distance}, ${status})
  `
  return { runId: candidate }
}

export async function editDirectoryRun(runId: string, fields: {
  name: string; day: string; time: string; location: string; distance: string; category: NBRCategory
}): Promise<{ error?: string }> {
  try {
    const user = await currentUser()
    if (!user || user.publicMetadata?.admin !== true) return { error: 'Unauthorized' }
    const name = fields.name.trim()
    if (!name) return { error: 'Name is required' }
    const kind = NBR_CATEGORY_TO_KIND[fields.category]
    if (!kind) return { error: 'Invalid category' }
    await sql`
      UPDATE runs SET
        name = ${name}, day_of_week = ${fields.day}, meeting_time = ${fields.time},
        meeting_location = ${fields.location}, distance = ${fields.distance}, kind = ${kind}
      WHERE id = ${runId}
    `
    updateTag('tigerwolves-data')
    return {}
  } catch (err) {
    Sentry.captureException(err)
    return { error: 'Failed to save run' }
  }
}

export async function addDirectoryRun(fields: {
  name: string; day: string; time: string; location: string; distance: string; category: NBRCategory
}): Promise<{ error?: string; runId?: string }> {
  try {
    const user = await currentUser()
    if (!user || user.publicMetadata?.admin !== true) return { error: 'Unauthorized' }
    const kind = NBR_CATEGORY_TO_KIND[fields.category]
    if (!kind) return { error: 'Invalid category' }
    const result = await insertRun(
      { name: fields.name, dayOfWeek: fields.day, meetingTime: fields.time, meetingLocation: fields.location, distance: fields.distance, kind },
      'unclaimed',
    )
    if (result.error) return result
    updateTag('tigerwolves-data')
    return { runId: result.runId }
  } catch (err) {
    Sentry.captureException(err)
    return { error: 'Failed to add run' }
  }
}

export async function removeDirectoryRun(runId: string): Promise<{ error?: string }> {
  try {
    const user = await currentUser()
    if (!user || user.publicMetadata?.admin !== true) return { error: 'Unauthorized' }
    // Guard: refuse if the run has any dependency (leader / follower / schedule).
    const [leaders, followers, sched] = await Promise.all([
      sql`SELECT 1 FROM run_leaders WHERE run_id = ${runId} LIMIT 1`,
      sql`SELECT 1 FROM runner_follows WHERE run_id = ${runId} LIMIT 1`,
      sql`SELECT 1 FROM schedule WHERE run_id = ${runId} LIMIT 1`,
    ])
    if (leaders.length || followers.length || sched.length) {
      return { error: 'This run has a leader, followers, or schedule — remove those first.' }
    }
    await sql`DELETE FROM runs WHERE id = ${runId}`
    updateTag('tigerwolves-data')
    return {}
  } catch (err) {
    Sentry.captureException(err)
    return { error: 'Failed to remove run' }
  }
}

// Stand up an unclaimed stub as a private draft: create its content-owning
// run_group and flip unclaimed → draft. Assigns NO leader — leaders are added
// later via the per-run Roster tab (#444).
export async function setUpRun(runId: string): Promise<{ error?: string }> {
  try {
    const user = await currentUser()
    if (!user || user.publicMetadata?.admin !== true) return { error: 'Unauthorized' }
    const rows = await sql`SELECT status, name, meeting_location FROM runs WHERE id = ${runId}`
    if (!rows[0]) return { error: 'Run not found' }
    if (rows[0].status !== 'unclaimed') return { error: 'This run is not unclaimed.' }

    // Reconcile a run_group so the now-draft run owns its library (#401 invariant).
    const runGroupId = await resolveOrCreateRunGroup(rows[0].name as string, 'road', rows[0].meeting_location as string)
    await sql`UPDATE runs SET status = 'draft', run_group_id = ${runGroupId} WHERE id = ${runId}`
    updateTag('tigerwolves-data')
    return {}
  } catch (err) {
    Sentry.captureException(err)
    return { error: 'Failed to set up run' }
  }
}

