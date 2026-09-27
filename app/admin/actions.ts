'use server'
import { currentUser } from '@clerk/nextjs/server'
import { updateTag } from 'next/cache'
import * as Sentry from '@sentry/nextjs'
import { sql } from '@/lib/db'
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


