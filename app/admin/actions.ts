'use server'
import { currentUser } from '@clerk/nextjs/server'
import { updateTag } from 'next/cache'
import * as Sentry from '@sentry/nextjs'
import { sql, resolveOrCreateRunGroup } from '@/lib/db'
import { RUN_KINDS, WORKOUT_TYPE_OPTIONS } from '@/lib/runProfile'
import { RunIdentityValues, validateRunIdentity, slugifyRunName } from '@/lib/runIdentity'

// Private helper — no admin gate, no cache invalidation. Called by createRun
// after it performs its own auth + pre-checks.
async function insertRun(
  data: { identity: RunIdentityValues; kind: string; workoutTypes: string[] },
): Promise<{ error?: string; runId?: string }> {
  // 1. Validate identity fields
  const invalid = validateRunIdentity(data.identity)
  if (invalid.error) return { error: invalid.error }

  // 2. Validate kind
  if (!(RUN_KINDS as readonly string[]).includes(data.kind)) return { error: 'Invalid run kind' }

  // 3. Reject duplicate names (case-insensitive) — a run's display name must be unique so
  //    the app never shows two identically-named runs. This is distinct from the slug
  //    collision handling below: two *different* names can still slugify to the same id
  //    (e.g. "St. Marks" and "St Marks" → "st-marks"), and that case still gets a -2 suffix.
  const name = data.identity.name.trim()
  const dup = await sql`SELECT 1 FROM runs WHERE LOWER(name) = LOWER(${name}) LIMIT 1`
  if (dup.length > 0) return { error: 'A run with this name already exists' }

  // 4. Filter workoutTypes — only keep valid types for Workout runs, empty otherwise
  const workoutTypes =
    data.kind === 'Workout'
      ? data.workoutTypes.filter(t => (WORKOUT_TYPE_OPTIONS as readonly string[]).includes(t))
      : []

  // 5. Slug: base from name, probe for collisions and append -2, -3, … until free
  const base = slugifyRunName(name) || 'run'
  let candidate = base
  let suffix = 2
  for (;;) {
    const existing = await sql`SELECT 1 FROM runs WHERE id = ${candidate}`
    if (existing.length === 0) break
    candidate = `${base}-${suffix}`
    suffix++
  }
  const runId = candidate

  // 6. #401 (Story A): reconcile the run to a run_group so its library is owned,
  //    not NULL — a run created via the app must curate its own per-run pool (AC7).
  //    Keyed by the run's name (run_groups.name is UNIQUE); an existing same-named
  //    group is reused. venue defaults to 'road'; default_location = meeting location.
  const runGroupId = await resolveOrCreateRunGroup(name, 'road', data.identity.meetingLocation)

  // 7. INSERT — post_header, closing_notes, leader_intro left NULL; cycle_mode/cycle
  //    take their NOT NULL DEFAULT values ('none'/'{}'). status is set explicitly to
  //    'draft' — admin publishes via a separate action (#353).
  await sql`
    INSERT INTO runs (id, name, emoji, description, day_of_week, meeting_time, meeting_location, kind, workout_types, run_group_id, status)
    VALUES (
      ${runId},
      ${name},
      ${data.identity.emoji},
      ${data.identity.description},
      ${data.identity.dayOfWeek},
      ${data.identity.meetingTime},
      ${data.identity.meetingLocation},
      ${data.kind},
      ${workoutTypes}::text[],
      ${runGroupId},
      'draft'
    )
  `

  return { runId }
}

export async function createRun(data: {
  identity: RunIdentityValues
  kind: string
  workoutTypes: string[]
}): Promise<{ error?: string; runId?: string }> {
  try {
    // 1. Admin gate — publicMetadata.admin === true (not role)
    const user = await currentUser()
    if (!user || user.publicMetadata?.admin !== true) return { error: 'Unauthorized' }

    const result = await insertRun(data)
    if (result.error) return result

    // Invalidate cache
    updateTag('tigerwolves-data')

    // Return the new run's slug id
    return { runId: result.runId }
  } catch (err) {
    Sentry.captureException(err)
    return { error: 'Failed to create run' }
  }
}

