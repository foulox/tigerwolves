import { existsSync, writeFileSync } from 'fs'
import { join } from 'path'
import { neon } from '@neondatabase/serverless'
import Anthropic from '@anthropic-ai/sdk'
import type { Workout } from '../lib/data'
import { groupWorkoutsIntoFamilies, type BackfillFamily } from '../lib/backfillGrouping'
import { buildInferPrompt, parseInferredFields } from '../lib/workoutInference'

// #275 — step 1 of 2. Reads every row in the legacy `workouts` table, groups
// rows sharing a `name` into one family with multiple variants (mirroring how
// RegroupWorkoutsForm already treats them), runs #274's AI turnaround
// suggestion against each variant that needs one, and writes it all to a
// reviewable JSON file. Nothing is written to workout_families/workout_variants
// here — that only happens once Lou approves entries and runs
// scripts/backfill-apply.ts. Re-run this script only after moving or deleting
// an existing review file; it refuses to overwrite one in place so in-progress
// review/approval edits are never silently lost.
//
// Usage: npx tsx scripts/backfill-generate-review.ts
// Must be run from the repo root (schema-semantics.yml is loaded relative to cwd).

const OUTPUT_PATH = join(process.cwd(), 'scripts', 'backfill-review.json')

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set')

const sql = neon(url)
const anthropic = new Anthropic()

type RunGroup = { id: number; name: string; venue: string }

type ReviewFile = {
  generatedAt: string
  runGroups: Pick<RunGroup, 'id' | 'name'>[]
  runGroupVenue: string
  families: BackfillFamily[]
}

function save(review: ReviewFile) {
  writeFileSync(OUTPUT_PATH, JSON.stringify(review, null, 2))
}

async function fetchLegacyWorkouts(): Promise<Workout[]> {
  const rows = await sql`SELECT * FROM workouts ORDER BY name, progression NULLS LAST`
  return rows.map((r): Workout => ({
    name: r.name as string,
    sport: r.sport as string,
    category: r.category as string,
    type: r.type as string,
    reason: r.reason as string,
    instructions: r.instructions as string,
    distTime: r.dist_time as string,
    lapStructure: r.lap_structure as string,
    energySystem: r.energy_system as string,
    hrZone: r.hr_zone as string,
    rpe: r.rpe as string,
    lastRan: r.last_ran ? String(r.last_ran).slice(0, 10) : null,
    coachingNotes: (r.coaching_notes as string | null) ?? null,
    mapLink: (r.map_link as string | null) ?? null,
    variation: r.variation as string,
    progression: (r.progression as number | null) ?? null,
    author: (r.author as string | null) ?? null,
    raceTypes: (r.race_types as string[]) ?? [],
    trainingPhases: (r.training_phases as string[]) ?? [],
    hasTurnaround: r.has_turnaround as boolean,
    turnaroundDistance: r.turnaround_distance as string,
    flagged: r.flagged as boolean,
    flagNote: r.flag_note as string,
  }))
}

async function fetchRunGroups(): Promise<RunGroup[]> {
  const rows = await sql`SELECT id, name, venue FROM run_groups ORDER BY name`
  return rows.map((r) => ({ id: r.id as number, name: r.name as string, venue: r.venue as string }))
}

async function suggestTurnaround(
  family: BackfillFamily,
  variant: BackfillFamily['variants'][number],
  venue: string,
): Promise<string> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: buildInferPrompt({
        name: family.legacyName,
        category: family.category,
        type: family.type,
        instructions: variant.rawInput,
        reason: family.reason,
        venue,
        hasTurnaroundHint: true,
      }),
    }],
  })
  const raw = message.content[0].type === 'text' ? message.content[0].text : ''
  return parseInferredFields(raw).turnaround
}

async function main() {
  if (existsSync(OUTPUT_PATH)) {
    throw new Error(
      `${OUTPUT_PATH} already exists — move it aside or delete it first if you really want to regenerate ` +
      `(regenerating overwrites any approvals already recorded in it).`
    )
  }

  console.log(`Reading legacy workouts from ${url!.split('@')[1]}...`)
  const [legacyWorkouts, runGroups] = await Promise.all([fetchLegacyWorkouts(), fetchRunGroups()])
  const tigerWolves = runGroups.find(g => g.name === 'TigerWolves')
  if (!tigerWolves) {
    throw new Error(
      "No 'TigerWolves' row in run_groups — run scripts/run-migrate.ts first (it seeds this row as part of #274's migration)."
    )
  }
  console.log(`  found ${legacyWorkouts.length} legacy workout rows`)
  console.log(
    "  note: legacy 'sport', 'lapStructure', and 'lastRan' have no column on workout_families/" +
    "workout_variants (#272 schema) and are dropped, not carried over."
  )

  // Every legacy workout is TigerWolves-run-group content by default (that's
  // all there ever was before #272), but not every workout necessarily
  // belongs there — e.g. a generic drill that isn't specific to any one run
  // group should end up "Global" (run_group_id = NULL) instead. Default
  // everything to TigerWolves and let the reviewer move individual families
  // to Global (or another group) by editing runGroupId per family.
  const families = groupWorkoutsIntoFamilies(legacyWorkouts, tigerWolves.id)
  const totalVariants = families.reduce((n, f) => n + f.variants.length, 0)
  const needsTurnaround = families.flatMap(f => f.variants).filter(v => v.hasTurnaround && v.rawInput.trim())
  console.log(`  grouped into ${families.length} families, ${totalVariants} variants`)
  console.log(`  ${needsTurnaround.length} variant(s) need an AI turnaround suggestion`)

  const output: ReviewFile = {
    generatedAt: new Date().toISOString(),
    runGroups: runGroups.map(g => ({ id: g.id, name: g.name })),
    runGroupVenue: tigerWolves.venue,
    families,
  }
  // Write the file up front (before any AI calls) and re-save after every
  // attempt below — a run that's killed partway through (network drop, laptop
  // sleep, Ctrl-C) still leaves every turnaround suggestion made so far on
  // disk instead of losing the whole batch of Anthropic calls to a restart.
  save(output)

  let done = 0
  for (const family of families) {
    for (const variant of family.variants) {
      if (!variant.hasTurnaround) continue
      if (!variant.rawInput.trim()) {
        variant.warnings.push('hasTurnaround is true but instructions are empty — nothing to suggest a turnaround from')
        continue
      }
      done++
      const label = variant.legacyVariation || '(base)'
      try {
        variant.turnaround = await suggestTurnaround(family, variant, tigerWolves.venue)
        console.log(`  [${done}/${needsTurnaround.length}] ${family.legacyName} (${label}) -> "${variant.turnaround}"`)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        variant.warnings.push(`AI turnaround suggestion failed: ${message}`)
        console.log(`  [${done}/${needsTurnaround.length}] ${family.legacyName} (${label}) -> FAILED: ${message}`)
      } finally {
        save(output)
      }
    }
  }

  const familyWarnings = families.filter(f => f.warnings.length > 0).length
  console.log(`\nWrote ${OUTPUT_PATH}`)
  console.log(`  ${families.length} families, ${totalVariants} variants, ${familyWarnings} with family-level warnings to review`)
  console.log('Next: open the file, edit/approve entries (set "approved": true per variant), then run scripts/backfill-apply.ts.')
}

main().catch(err => { console.error(err); process.exit(1) })
