import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { neon } from '@neondatabase/serverless'
import type { BackfillFamily } from '../lib/backfillGrouping'

// #275 — step 2 of 2. Reads the review file scripts/backfill-generate-review.ts
// produced, and for every variant marked "approved": true that hasn't already
// been committed, writes a workout_families/workout_variants row pair (or
// reuses the family row a sibling variant already created). Safe to re-run:
// already-committed variants are skipped, and progress is written back to the
// same file after every insert, so an interrupted run picks up where it left
// off instead of silently stalling or double-inserting.
//
// Usage: npx tsx scripts/backfill-apply.ts
// Must be run from the repo root — reads/writes scripts/backfill-review.json.

const REVIEW_PATH = join(process.cwd(), 'scripts', 'backfill-review.json')

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set')

const sql = neon(url)

type ReviewFile = {
  generatedAt: string
  runGroupId: number
  runGroupVenue: string
  families: BackfillFamily[]
}

function loadReview(): ReviewFile {
  if (!existsSync(REVIEW_PATH)) {
    throw new Error(`${REVIEW_PATH} not found — run scripts/backfill-generate-review.ts first.`)
  }
  return JSON.parse(readFileSync(REVIEW_PATH, 'utf-8')) as ReviewFile
}

function save(review: ReviewFile) {
  writeFileSync(REVIEW_PATH, JSON.stringify(review, null, 2))
}

async function insertFamily(family: BackfillFamily, runGroupId: number): Promise<number> {
  const [row] = await sql`
    INSERT INTO workout_families (name, category, type, reason, author, coaching_notes, map_link, run_group_id)
    VALUES (${family.legacyName}, ${family.category}, ${family.type}, ${family.reason}, ${family.author}, ${family.coachingNotes}, ${family.mapLink}, ${runGroupId})
    RETURNING id
  `
  return row.id as number
}

async function insertVariant(familyId: number, variant: BackfillFamily['variants'][number]): Promise<number> {
  const [row] = await sql`
    INSERT INTO workout_variants (
      family_id, label, sort_order, raw_input, has_turnaround, turnaround,
      energy_system, hr_zone, rpe, dist_time, race_types, training_phases, flagged, flag_note
    ) VALUES (
      ${familyId}, ${variant.label}, ${variant.sortOrder}, ${variant.rawInput}, ${variant.hasTurnaround}, ${variant.turnaround},
      ${variant.energySystem}, ${variant.hrZone}, ${variant.rpe}, ${variant.distTime}, ${variant.raceTypes}, ${variant.trainingPhases},
      ${variant.flagged}, ${variant.flagNote}
    )
    RETURNING id
  `
  return row.id as number
}

async function main() {
  const review = loadReview()
  console.log(`Applying ${REVIEW_PATH} against ${url!.split('@')[1]}...`)

  let committed = 0
  let pending = 0
  let alreadyDone = 0
  let failed = 0

  for (const family of review.families) {
    for (const variant of family.variants) {
      if (variant.committed) { alreadyDone++; continue }
      if (!variant.approved) { pending++; continue }

      const label = variant.legacyVariation || '(base)'
      try {
        if (family.familyId == null) {
          family.familyId = await insertFamily(family, review.runGroupId)
        }
        variant.variantId = await insertVariant(family.familyId, variant)
        variant.committed = true
        committed++
        console.log(`  committed ${family.legacyName} (${label}) -> family ${family.familyId}, variant ${variant.variantId}`)
      } catch (err) {
        failed++
        const message = err instanceof Error ? err.message : String(err)
        console.error(`  FAILED ${family.legacyName} (${label}): ${message}`)
      } finally {
        // Persist after every attempt, not just at the end — an interrupted run
        // (or a crash partway through) leaves the file reflecting exactly what's
        // actually in the database, so re-running never double-inserts.
        save(review)
      }
    }
  }

  const totalVariants = review.families.reduce((n, f) => n + f.variants.length, 0)
  console.log(`\n${committed} committed, ${alreadyDone} already done, ${pending} still awaiting approval, ${failed} failed`)
  console.log(`(${committed + alreadyDone}/${totalVariants} variants done overall)`)
  if (pending > 0) {
    console.log(`Approve remaining entries in ${REVIEW_PATH} and re-run to continue.`)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
