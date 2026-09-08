/**
 * Partner run onboarding script.
 *
 * Usage:
 *   DATABASE_URL=<neon-production-url> npx tsx scripts/import-run.ts
 *
 * Populate the RUN_CONFIG constant below with the partner run's data, then run
 * once against production. The script is idempotent — rerunning it with the
 * same run id is safe (INSERT ... ON CONFLICT DO NOTHING for the runs row;
 * workout rows are skipped if a family with the same name already exists for
 * that run group).
 *
 * After importing, Lou sets publicMetadata.role = 'leader' in the Clerk dashboard
 * for each of the run's leaders.
 */

import { neon } from '@neondatabase/serverless'

// Guard against running against the staging E2E database.
const STAGING_HOST = 'ep-fragrant-sunset-atmdps9n-pooler.c-9.us-east-1.aws.neon.tech'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set')
if (url.includes(STAGING_HOST)) {
  throw new Error('import-run.ts refuses to run: DATABASE_URL points at the staging E2E database. Use the production connection string.')
}

const sql = neon(url)

// ── Types ──────────────────────────────────────────────────────────────────

export interface WorkoutImport {
  name: string
  category: string       // 'Quality' | 'Long' | 'Easy'
  type: string           // 'Threshold' | 'Ladder' | 'Interval' | etc.
  reason?: string
  author?: string
  instructions: string   // raw leader description
  distTime?: string
}

export interface RunImportConfig {
  id: string             // slug — e.g. 'mourning-doves'
  name: string           // display name — e.g. 'Mourning Doves'
  emoji: string          // e.g. '🕊️'
  description: string    // shown on All Runs and per-run page
  dayOfWeek: string      // 'Monday' | 'Tuesday' | etc.
  meetingTime: string    // '6:30 AM'
  meetingLocation: string
  warmupDescription: string
  closingNotes: string
  postHeader: string     // full opening block of the Heylo post
  workouts: WorkoutImport[]
}

// ── Config — edit this section for each new run ────────────────────────────

const RUN_CONFIG: RunImportConfig = {
  id: 'example-run',
  name: 'Example Run',
  emoji: '🏃',
  description: 'Replace this with the partner run description.',
  dayOfWeek: 'Monday',
  meetingTime: '6:30 AM',
  meetingLocation: 'Replace with meeting location.',
  warmupDescription: 'Replace with warm-up block text.',
  closingNotes: 'Replace with closing notes (bag drop, logistics).',
  postHeader: 'Replace with the full opening block of the Heylo post.',
  workouts: [
    // Example entry — replace with the real workout list:
    // {
    //   name: 'Yasso 800s',
    //   category: 'Quality',
    //   type: 'Interval',
    //   reason: 'Classic VO2max session.',
    //   instructions: '10 x 800m @ 5K effort, 400m jog recovery.',
    //   distTime: '~5 miles total',
    // },
  ],
}

// ── Import logic ───────────────────────────────────────────────────────────

export async function importRun(config: RunImportConfig): Promise<void> {
  if (config.id === 'example-run') {
    throw new Error('RUN_CONFIG is still set to the placeholder. Edit the config before running.')
  }
  console.log(`Importing run: ${config.name} (${config.id})`)

  // 1. Upsert the runs row.
  await sql`
    INSERT INTO runs (id, name, emoji, description, day_of_week, meeting_time,
                      meeting_location, warmup_description, closing_notes, post_header)
    VALUES (
      ${config.id}, ${config.name}, ${config.emoji}, ${config.description},
      ${config.dayOfWeek}, ${config.meetingTime}, ${config.meetingLocation},
      ${config.warmupDescription}, ${config.closingNotes}, ${config.postHeader}
    )
    ON CONFLICT (id) DO UPDATE SET
      name               = EXCLUDED.name,
      emoji              = EXCLUDED.emoji,
      description        = EXCLUDED.description,
      day_of_week        = EXCLUDED.day_of_week,
      meeting_time       = EXCLUDED.meeting_time,
      meeting_location   = EXCLUDED.meeting_location,
      warmup_description = EXCLUDED.warmup_description,
      closing_notes      = EXCLUDED.closing_notes,
      post_header        = EXCLUDED.post_header
  `
  console.log(`  ✓ runs row upserted`)

  // 2. Upsert the run_groups row (used by workout_families for library scoping).
  const groupRows = await sql`
    INSERT INTO run_groups (name, venue, default_location)
    VALUES (${config.name}, 'road', ${config.meetingLocation})
    ON CONFLICT DO NOTHING
    RETURNING id
  `
  let runGroupId: number
  if (groupRows.length > 0) {
    runGroupId = groupRows[0].id as number
  } else {
    const existing = await sql`SELECT id FROM run_groups WHERE name = ${config.name}`
    runGroupId = existing[0].id as number
  }
  console.log(`  ✓ run_groups row ready (id=${runGroupId})`)

  // 3. Insert workout families + variants.
  let inserted = 0
  let skipped = 0
  for (const w of config.workouts) {
    // Check if a family with this name already exists for this run group.
    const existing = await sql`
      SELECT id FROM workout_families WHERE name = ${w.name} AND run_group_id = ${runGroupId}
    `
    if (existing.length > 0) {
      skipped++
      continue
    }

    const familyRows = await sql`
      INSERT INTO workout_families (name, category, type, reason, author, coaching_notes, run_group_id)
      VALUES (${w.name}, ${w.category}, ${w.type}, ${w.reason ?? null}, ${w.author ?? null}, null, ${runGroupId})
      RETURNING id
    `
    const familyId = familyRows[0].id as number

    await sql`
      INSERT INTO workout_variants (family_id, label, sort_order, raw_input, dist_time)
      VALUES (${familyId}, null, null, ${w.instructions}, ${w.distTime ?? null})
    `
    inserted++
  }
  console.log(`  ✓ workouts: ${inserted} inserted, ${skipped} skipped (already exist)`)
  console.log(`Done. Remind Lou to set publicMetadata.role = 'leader' in Clerk for each ${config.name} leader.`)
}

// ── Run ────────────────────────────────────────────────────────────────────

importRun(RUN_CONFIG).catch((err) => {
  console.error(err)
  process.exit(1)
})
