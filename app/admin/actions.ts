'use server'
import { currentUser } from '@clerk/nextjs/server'
import { updateTag } from 'next/cache'
import * as Sentry from '@sentry/nextjs'
import { sql } from '@/lib/db'
import { RUN_KINDS, WORKOUT_TYPE_OPTIONS } from '@/lib/runProfile'
import { RunIdentityValues, validateRunIdentity, slugifyRunName } from '@/lib/runIdentity'
import { NBR_RUNS } from '@/lib/allRunsData'

// Private helper — no admin gate, no cache invalidation. Called by both createRun
// and activateNbrRun after each performs its own auth + pre-checks.
async function insertRun(
  data: { identity: RunIdentityValues; kind: string; workoutTypes: string[] },
  nbrDirectoryId?: string | null,
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

  // 6. INSERT — leave run_group_id, post_header, closing_notes, leader_intro NULL;
  //    cycle_mode/cycle take their NOT NULL DEFAULT values ('none'/'{}').
  //    nbr_directory_id is NULL when nbrDirectoryId is undefined/null (createRun path).
  await sql`
    INSERT INTO runs (id, name, emoji, description, day_of_week, meeting_time, meeting_location, warmup_description, kind, workout_types, nbr_directory_id)
    VALUES (
      ${runId},
      ${name},
      ${data.identity.emoji},
      ${data.identity.description},
      ${data.identity.dayOfWeek},
      ${data.identity.meetingTime},
      ${data.identity.meetingLocation},
      ${data.identity.warmupDescription},
      ${data.kind},
      ${workoutTypes}::text[],
      ${nbrDirectoryId ?? null}
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

export async function activateNbrRun(data: {
  nbrId: string
  identity: RunIdentityValues
  kind: string
  workoutTypes: string[]
}): Promise<{ error?: string; runId?: string }> {
  try {
    // 1. Admin gate — identical inline check to createRun
    const user = await currentUser()
    if (!user || user.publicMetadata?.admin !== true) return { error: 'Unauthorized' }

    // 2. Validate nbrId — must be a known entry in the static directory
    const nbrEntry = NBR_RUNS.find(r => r.id === data.nbrId)
    if (!nbrEntry) return { error: 'Unknown run' }

    // 3. Pre-check already-activated — common-case guard before the INSERT
    const alreadyActivated = await sql`
      SELECT 1 FROM runs WHERE nbr_directory_id = ${data.nbrId} LIMIT 1
    `
    if (alreadyActivated.length > 0) return { error: 'This run is already activated' }

    // 4. Insert
    const result = await insertRun(data, data.nbrId)

    // 5. Race safety: catch partial-unique-index violation (pg error code 23505)
    //    on nbr_directory_id. insertRun throws — we catch it here.
    if (result.error) return result

    // 6. Invalidate cache on success
    updateTag('tigerwolves-data')

    return { runId: result.runId }
  } catch (err: unknown) {
    // Catch pg unique-violation on nbr_directory_id (concurrent race — the pre-check
    // covers the common case; the partial unique index covers concurrent requests).
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === '23505' &&
      (err as { constraint?: string }).constraint === 'runs_nbr_directory_id_key'
    ) {
      return { error: 'This run is already activated' }
    }
    Sentry.captureException(err)
    return { error: 'Failed to activate run' }
  }
}
