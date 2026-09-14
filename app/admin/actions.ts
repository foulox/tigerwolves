'use server'
import { currentUser } from '@clerk/nextjs/server'
import { updateTag } from 'next/cache'
import * as Sentry from '@sentry/nextjs'
import { sql } from '@/lib/db'
import { RUN_KINDS, WORKOUT_TYPE_OPTIONS } from '@/lib/runProfile'
import { RunIdentityValues, validateRunIdentity, slugifyRunName } from '@/lib/runIdentity'

export async function createRun(data: {
  identity: RunIdentityValues
  kind: string
  workoutTypes: string[]
}): Promise<{ error?: string; runId?: string }> {
  try {
    // 1. Admin gate — publicMetadata.admin === true (not role)
    const user = await currentUser()
    if (!user || user.publicMetadata?.admin !== true) return { error: 'Unauthorized' }

    // 2. Validate identity fields
    const invalid = validateRunIdentity(data.identity)
    if (invalid.error) return { error: invalid.error }

    // 3. Validate kind
    if (!(RUN_KINDS as readonly string[]).includes(data.kind)) return { error: 'Invalid run kind' }

    // 4. Filter workoutTypes — only keep valid types for Workout runs, empty otherwise
    const workoutTypes =
      data.kind === 'Workout'
        ? data.workoutTypes.filter(t => (WORKOUT_TYPE_OPTIONS as readonly string[]).includes(t))
        : []

    // 5. Slug: base from name, probe for collisions and append -2, -3, … until free
    const base = slugifyRunName(data.identity.name) || 'run'
    let candidate = base
    let suffix = 2
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await sql`SELECT 1 FROM runs WHERE id = ${candidate}`
      if (existing.length === 0) break
      candidate = `${base}-${suffix}`
      suffix++
    }
    const runId = candidate

    // 6. INSERT — leave run_group_id, post_header, closing_notes, leader_intro NULL;
    //    cycle_mode/cycle take their NOT NULL DEFAULT values ('none'/'{}').
    await sql`
      INSERT INTO runs (id, name, emoji, description, day_of_week, meeting_time, meeting_location, warmup_description, kind, workout_types)
      VALUES (
        ${runId},
        ${data.identity.name.trim()},
        ${data.identity.emoji},
        ${data.identity.description},
        ${data.identity.dayOfWeek},
        ${data.identity.meetingTime},
        ${data.identity.meetingLocation},
        ${data.identity.warmupDescription},
        ${data.kind},
        ${workoutTypes}::text[]
      )
    `

    // 7. Invalidate cache
    updateTag('tigerwolves-data')

    // 8. Return the new run's slug id
    return { runId }
  } catch (err) {
    Sentry.captureException(err)
    return { error: 'Failed to create run' }
  }
}
