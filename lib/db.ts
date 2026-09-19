import { neon } from '@neondatabase/serverless'
import { unstable_cache } from 'next/cache'
import type { ScheduleEntry, Race, RunGroup, WorkoutVariantRow, RunConfig, RunLeader, AwayPeriod } from './data'
import { weekOfMonth } from './data'
import { resolveWorkoutType } from './cycle'
import type { WorkoutVariantInput } from './workoutVariant'
import { getNextLeader } from './rotation'
import { resolveWorkoutVariant } from './scheduleUtils'
import type { MyPlanItem } from './myPlan'

// The Neon–Vercel integration injects DATABASE_URL dynamically per git-branch at
// deploy time, which overrides any manually-set value — so the durable demo can't be
// pinned to its demo-data branch via DATABASE_URL alone (the integration keeps handing
// the `staging` branch the auto-provisioned preview/staging DB = the E2E-wipe branch).
// DEMO_DATABASE_URL is a name the integration never manages: it's set ONLY on the demo
// (Preview, gitBranch=staging) and points at the durable demo-data branch. Production and
// PR-preview deploys leave it unset and read their own DATABASE_URL (prod / per-PR
// isolated branch) unchanged — that per-PR isolation is the integration behaviour we
// intentionally keep. See #376.
const dbUrl = process.env.DEMO_DATABASE_URL || process.env.DATABASE_URL

if (!dbUrl) {
  throw new Error('DATABASE_URL is not set')
}

export const sql = neon(dbUrl)

export function toDateString(val: unknown): string {
  if (!val) return ''
  if (val instanceof Date) return val.toISOString().slice(0, 10)
  return String(val).slice(0, 10)
}

// ── Reads ─────────────────────────────────────────────────────────────────────

export async function fetchSchedule(runId?: string): Promise<ScheduleEntry[]> {
  const rows = runId
    ? await sql`SELECT * FROM schedule WHERE run_id = ${runId} ORDER BY date ASC`
    : await sql`SELECT * FROM schedule ORDER BY date ASC`
  return rows.map((r) => {
    const date = toDateString(r.date)
    return {
      date,
      weekOfMonth: weekOfMonth(date),
      workoutType: r.workout_type as string,
      leader: r.leader as string,
      workoutName: (r.workout_name as string | null) ?? null,
      selectedVariations: (r.selected_variations as string[]) ?? [''],
      needsLeader: r.needs_leader === true,
    }
  })
}

// Joins workout_variants + workout_families (#276) — the read-side counterpart to
// dbInsertWorkoutVariant/dbUpdateWorkoutVariant (#274).
//
// #401 (Story A) reactivates run_group scoping: when `runId` is given AND that run
// is reconciled to a run_group, only that group's workout_families are returned —
// the per-run library. #347 had made this the full shared catalog (arg ignored);
// #401 makes each run curate its own pool again. Callers that need the FULL catalog
// (Library's "All runs" escape hatch, Schedule's cross-catalog search) call this
// with no arg / undefined. A run with no run_group yet (legacy NULL) falls back to
// the full catalog so its library is never empty (backfill closes this gap for
// production; the fallback covers any run reconciliation hasn't reached).
//
// #402: `lastRan` is per (run, workout) — a shared route's last-run differs by run —
// so it's read from run_workouts(recencyRunId, family).last_ran via a LEFT JOIN. The
// recency run is `recencyRunId ?? runId`: scoped callers get their own run's recency
// for free, while the Library "All runs" view passes the VIEWER's runId separately
// (AC6) so recency stays the viewer's even while browsing the full catalog. When no
// recency run is given, the join matches nothing → lastRan is null everywhere (the
// pre-#402 behavior), so the aggregate/anonymous paths are unchanged.
export async function fetchWorkoutVariants(
  runId?: string,
  recencyRunId?: string,
): Promise<WorkoutVariantRow[]> {
  let groupId: number | null = null
  if (runId) {
    const [run] = await sql`SELECT run_group_id FROM runs WHERE id = ${runId}`
    groupId = (run?.run_group_id as number | null) ?? null
  }
  const recencyRun = recencyRunId ?? runId ?? null

  const rows = groupId != null
    ? await sql`
        SELECT
          wv.id AS variant_id, wv.family_id, wf.name, wv.label, wv.sort_order,
          wf.category, wf.type, wf.reason, wv.raw_input, wv.dist_time,
          wv.energy_system, wv.hr_zone, wv.rpe, wf.coaching_notes, wf.map_link,
          wf.author, wv.race_types, wv.training_phases, wv.has_turnaround,
          wv.turnaround, wv.flagged, wv.flag_note, wf.run_group_id, rw.last_ran
        FROM workout_variants wv
        JOIN workout_families wf ON wf.id = wv.family_id
        LEFT JOIN run_workouts rw ON rw.family_id = wf.id AND rw.run_id = ${recencyRun}
        WHERE wf.run_group_id = ${groupId}
        ORDER BY wf.name, wv.sort_order NULLS LAST
      `
    : await sql`
        SELECT
          wv.id AS variant_id, wv.family_id, wf.name, wv.label, wv.sort_order,
          wf.category, wf.type, wf.reason, wv.raw_input, wv.dist_time,
          wv.energy_system, wv.hr_zone, wv.rpe, wf.coaching_notes, wf.map_link,
          wf.author, wv.race_types, wv.training_phases, wv.has_turnaround,
          wv.turnaround, wv.flagged, wv.flag_note, wf.run_group_id, rw.last_ran
        FROM workout_variants wv
        JOIN workout_families wf ON wf.id = wv.family_id
        LEFT JOIN run_workouts rw ON rw.family_id = wf.id AND rw.run_id = ${recencyRun}
        ORDER BY wf.name, wv.sort_order NULLS LAST
      `
  return rows.map((r) => ({
    id: r.variant_id as number,
    familyId: r.family_id as number,
    name: r.name as string,
    label: (r.label as string | null) ?? null,
    sortOrder: (r.sort_order as number | null) ?? null,
    category: r.category as string,
    type: r.type as string,
    reason: (r.reason as string | null) ?? '',
    rawInput: r.raw_input as string,
    distTime: (r.dist_time as string | null) ?? '',
    energySystem: (r.energy_system as string | null) ?? '',
    hrZone: (r.hr_zone as string | null) ?? '',
    rpe: (r.rpe as string | null) ?? '',
    coachingNotes: (r.coaching_notes as string | null) ?? null,
    mapLink: (r.map_link as string | null) ?? null,
    author: (r.author as string | null) ?? null,
    raceTypes: (r.race_types as string[]) ?? [],
    trainingPhases: (r.training_phases as string[]) ?? [],
    hasTurnaround: r.has_turnaround as boolean,
    turnaround: (r.turnaround as string | null) ?? '',
    flagged: r.flagged as boolean,
    flagNote: r.flag_note as string,
    runGroupId: (r.run_group_id as number | null) ?? null,
    // #402: the recency run's last_ran for this family, or null ("Never"). Normalized
    // to a 'YYYY-MM-DD' string so the sort/label consumers compare it lexically.
    lastRan: r.last_ran != null ? toDateString(r.last_ran) : null,
  }))
}

export async function fetchRunGroups(): Promise<RunGroup[]> {
  const rows = await sql`
    SELECT * FROM run_groups ORDER BY name
  `
  return rows.map((r) => ({
    id: r.id as number,
    name: r.name as string,
    venue: r.venue as string,
    defaultLocation: (r.default_location as string | null) ?? null,
  }))
}

// #401 (Story A): the run_groups a leader is AUTHORIZED to assign a workout to —
// the groups owned by the runs they actively lead, and nothing else. This is the
// fix for the 96fcb3e hazard: the workout owner-picker offers ONLY these, never
// fetchRunGroups() wholesale (which would surface unrelated runs' groups). Distinct
// by group id (a leader leading two runs in the same group sees it once); runs with
// no reconciled group are skipped (the JOIN drops NULL run_group_id).
export async function getLeaderRunGroups(clerkUserId: string): Promise<RunGroup[]> {
  const rows = await sql`
    SELECT DISTINCT rg.id, rg.name, rg.venue, rg.default_location
    FROM run_leaders rl
    JOIN runs r ON r.id = rl.run_id
    JOIN run_groups rg ON rg.id = r.run_group_id
    WHERE rl.clerk_user_id = ${clerkUserId} AND rl.active = true
    ORDER BY rg.name
  `
  return rows.map((r) => ({
    id: r.id as number,
    name: r.name as string,
    venue: r.venue as string,
    defaultLocation: (r.default_location as string | null) ?? null,
  }))
}

// #404: the runs a leader actively leads — the adopt targets. A single-run leader
// adopts with no extra step; a multi-run leader is prompted to pick which of these
// to adopt into (AC6). Distinct by run id (a leader with two roster rows on the same
// run sees it once). Ordered by name for a stable picker.
export async function getLeaderRuns(clerkUserId: string): Promise<Array<{ id: string; name: string }>> {
  const rows = await sql`
    SELECT DISTINCT r.id, r.name
    FROM run_leaders rl
    JOIN runs r ON r.id = rl.run_id
    WHERE rl.clerk_user_id = ${clerkUserId} AND rl.active = true
    ORDER BY r.name
  `
  return rows.map((r) => ({ id: r.id as string, name: r.name as string }))
}

// #404: does this leader actively lead this run? The authz predicate behind
// adoptRoute / unadoptRoute — a leader may only change the library of a run they
// lead (AC8: no adopting into an unled run). Kept as its own query so the server
// action can reject before any write.
export async function leaderLeadsRun(clerkUserId: string, runId: string): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM run_leaders
    WHERE clerk_user_id = ${clerkUserId} AND run_id = ${runId} AND active = true
    LIMIT 1
  `
  return rows.length > 0
}

// #404: a run's library membership — the workout_families ids in run_workouts for
// this run. This is the single "Your run" visibility predicate: it holds routes the
// run created (seeded on migrate) AND routes it adopted. Replaces #401's
// run_group_id ownership check as the library-scope source.
export async function getRunLibraryFamilyIds(runId: string): Promise<number[]> {
  const rows = await sql`SELECT family_id FROM run_workouts WHERE run_id = ${runId}`
  return rows.map((r) => r.family_id as number)
}

// #401 (Story A): find-or-create the run_group that owns a run's workouts, keyed by
// name (run_groups.name is UNIQUE). Used to reconcile a newly created run to a group
// so its library isn't NULL-owned (AC7). Idempotent: an existing group with this name
// is reused, never duplicated.
export async function resolveOrCreateRunGroup(
  name: string,
  venue: string,
  defaultLocation: string | null,
): Promise<number> {
  const existing = await sql`SELECT id FROM run_groups WHERE name = ${name}`
  if (existing.length > 0) return existing[0].id as number
  const inserted = await sql`
    INSERT INTO run_groups (name, venue, default_location)
    VALUES (${name}, ${venue}, ${defaultLocation})
    RETURNING id
  `
  return inserted[0].id as number
}

export async function getLeaderRun(clerkUserId: string): Promise<RunConfig | null> {
  const rows = await sql`
    SELECT r.id, r.name, r.emoji, r.day_of_week, r.meeting_location,
           r.post_header, r.leader_intro, r.closing_notes,
           r.kind, r.workout_types, r.run_group_id, r.cycle_mode, r.cycle,
           r.description, r.meeting_time, r.status, r.post_template
    FROM run_leaders rl
    JOIN runs r ON r.id = rl.run_id
    WHERE rl.clerk_user_id = ${clerkUserId}
    LIMIT 1
  `
  if (!rows[0]) return null
  const r = rows[0]
  return {
    id: r.id as string,
    name: r.name as string,
    emoji: (r.emoji as string | null) ?? null,
    dayOfWeek: r.day_of_week as string,
    meetingLocation: r.meeting_location as string,
    postHeader: r.post_header as string,
    leaderIntro: (r.leader_intro as string | null) ?? 'Run Leaders:',
    closingNotes: r.closing_notes as string,
    kind: (r.kind as string | null) ?? '',
    workoutTypes: (r.workout_types as string[]) ?? [],
    runGroupId: (r.run_group_id as number | null) ?? null,
    cycleMode: (r.cycle_mode as string | null) ?? 'none',
    cycle: (r.cycle as Record<string, string> | null) ?? {},
    description: (r.description as string | null) ?? null,
    meetingTime: (r.meeting_time as string | null) ?? null,
    status: (r.status as string | null) ?? 'live',
    postTemplate: (r.post_template as string | null) ?? null,
  }
}

export async function getRunRoster(runId: string): Promise<RunLeader[]> {
  const rows = await sql`
    SELECT id, run_id, clerk_user_id, name, email, sort_order, away_periods
    FROM run_leaders
    WHERE run_id = ${runId} AND active = true
    ORDER BY sort_order ASC NULLS LAST, id ASC
  `
  return rows.map(r => ({
    id: r.id as number,
    runId: r.run_id as string,
    clerkUserId: (r.clerk_user_id as string | null) ?? null,
    name: r.name as string,
    email: (r.email as string | null) ?? null,
    sortOrder: (r.sort_order as number | null) ?? null,
    awayPeriods: (r.away_periods as AwayPeriod[]) ?? [],
  }))
}

export async function fetchRaces(): Promise<Race[]> {
  const rows = await sql`
    SELECT * FROM races ORDER BY date ASC
  `
  return rows.map((r) => ({
    id: r.id as number,
    date: toDateString(r.date),
    name: r.name as string,
    distance: r.distance as string,
    location: r.location as string,
    organizer: r.organizer as string,
    verified: r.verified as boolean,
    flagged: r.flagged as boolean,
    flagNote: r.flag_note as string,
  }))
}

// ── Writes ────────────────────────────────────────────────────────────────────

export async function dbSetScheduleWorkout(date: string, runId: string, workoutName: string, selectedVariations: string[]): Promise<void> {
  // Scoped by run_id: since #310 promoted the schedule PK to (date, run_id),
  // two runs can share a date, so a date-only UPDATE would hit the wrong run's row.
  await sql`
    UPDATE schedule SET workout_name = ${workoutName}, selected_variations = ${selectedVariations}
    WHERE date = ${date}::date AND run_id = ${runId}
  `
  // #402: keep this run's recency fresh (AC3). Only for a route ALREADY in the run's
  // library (a run_workouts membership row) and only for a past/today date — a future
  // plan hasn't been run yet. GREATEST ignores NULL, so a first run sets last_ran from
  // NULL; a re-plan onto an older date never regresses a newer one. Deliberately an
  // UPDATE, not an upsert: the "All runs" one-time borrow (#405) schedules a workout
  // the run has NOT adopted (no membership row), and its contract is that it "won't
  // join your library or rotation" — so it must not gain a run_workouts row here.
  if (workoutName) {
    await sql`
      UPDATE run_workouts rw
      SET last_ran = GREATEST(rw.last_ran, ${date}::date)
      FROM workout_families wf
      WHERE rw.run_id = ${runId}
        AND rw.family_id = wf.id
        AND wf.name = ${workoutName}
        AND ${date}::date <= CURRENT_DATE
    `
  }
}

export async function dbInsertRace(race: Omit<Race, 'id'>): Promise<number> {
  const rows = await sql`
    INSERT INTO races (date, name, distance, location, organizer, verified, flagged, flag_note)
    VALUES (${race.date}::date, ${race.name}, ${race.distance}, ${race.location}, ${race.organizer}, ${race.verified}, ${race.flagged}, ${race.flagNote})
    RETURNING id
  `
  return rows[0].id as number
}

export async function dbFlagRace(id: number, flagNote: string): Promise<void> {
  const rows = await sql`
    UPDATE races SET flagged = true, flag_note = ${flagNote} WHERE id = ${id}
    RETURNING id
  `
  if (rows.length === 0) throw new Error(`Race ${id} not found`)
}

export async function dbVerifyRace(id: number): Promise<void> {
  const rows = await sql`
    UPDATE races SET verified = true WHERE id = ${id}
    RETURNING id
  `
  if (rows.length === 0) throw new Error(`Race ${id} not found`)
}

export async function dbFixRace(
  id: number,
  fields: { name: string; date: string; distance: string; location: string; organizer: string },
): Promise<void> {
  const rows = await sql`
    UPDATE races SET
      name = ${fields.name},
      date = ${fields.date}::date,
      distance = ${fields.distance},
      location = ${fields.location},
      organizer = ${fields.organizer},
      verified = true,
      flagged = false,
      flag_note = ''
    WHERE id = ${id}
    RETURNING id
  `
  if (rows.length === 0) throw new Error(`Race ${id} not found`)
}

// ── workout_families / workout_variants writes (#274-#277) ─────────────────

export class WorkoutVariantNotFoundError extends Error {
  constructor(variantId: number) {
    super(`Workout variant ${variantId} not found`)
    this.name = 'WorkoutVariantNotFoundError'
  }
}

export async function dbInsertWorkoutVariant(
  w: WorkoutVariantInput,
): Promise<{ familyId: number; variantId: number }> {
  const [family] = await sql`
    INSERT INTO workout_families (name, category, type, reason, author, coaching_notes, map_link, run_group_id)
    VALUES (${w.name}, ${w.category}, ${w.type}, ${w.reason}, ${w.author}, ${w.coachingNotes}, ${w.mapLink}, ${w.runGroupId})
    RETURNING id
  `
  const familyId = family.id as number

  try {
    const [variant] = await sql`
      INSERT INTO workout_variants (
        family_id, label, sort_order, raw_input, has_turnaround, turnaround,
        energy_system, hr_zone, rpe, dist_time, race_types, training_phases
      ) VALUES (
        ${familyId}, NULL, NULL, ${w.instructions}, ${w.hasTurnaround}, ${w.turnaround},
        ${w.energySystem}, ${w.hrZone}, ${w.rpe}, ${w.distTime}, ${w.raceTypes}, ${w.trainingPhases}
      )
      RETURNING id
    `
    return { familyId, variantId: variant.id as number }
  } catch (err) {
    // Two sequential HTTP calls, not a single transaction (the neon serverless
    // driver's .transaction() only supports independent queries, not one that
    // depends on the previous query's result) — clean up the orphaned family
    // row by hand if the variant insert fails. Swallow a rollback failure
    // rather than let it replace `err` — the caller needs to know the variant
    // insert failed, not that the best-effort cleanup afterward also failed.
    await sql`DELETE FROM workout_families WHERE id = ${familyId}`.catch(() => {})
    throw err
  }
}

export async function dbUpdateWorkoutVariant(variantId: number, w: WorkoutVariantInput): Promise<void> {
  const [variant] = await sql`SELECT family_id FROM workout_variants WHERE id = ${variantId}`
  if (!variant) throw new WorkoutVariantNotFoundError(variantId)
  const familyId = variant.family_id as number

  await sql`
    UPDATE workout_families SET
      name = ${w.name},
      category = ${w.category},
      type = ${w.type},
      reason = ${w.reason},
      author = ${w.author},
      coaching_notes = ${w.coachingNotes},
      map_link = ${w.mapLink},
      run_group_id = ${w.runGroupId}
    WHERE id = ${familyId}
  `
  await sql`
    UPDATE workout_variants SET
      label = ${w.label},
      sort_order = ${w.sortOrder},
      raw_input = ${w.instructions},
      has_turnaround = ${w.hasTurnaround},
      turnaround = ${w.turnaround},
      energy_system = ${w.energySystem},
      hr_zone = ${w.hrZone},
      rpe = ${w.rpe},
      dist_time = ${w.distTime},
      race_types = ${w.raceTypes},
      training_phases = ${w.trainingPhases}
    WHERE id = ${variantId}
  `
}

// Adds a variant to an EXISTING family — the workout_variants-only counterpart
// to dbInsertWorkoutVariant (which always creates a brand-new family too).
// #277's fix for addVariation's half of the addWorkout/addVariation split-brain
// bug: this writes to the same tables the Library/Schedule screens now both read.
export async function dbAddWorkoutVariant(
  familyId: number,
  w: {
    label: string
    sortOrder: number
    instructions: string
    distTime: string
    energySystem: string
    hrZone: string
    rpe: string
    raceTypes: string[]
    trainingPhases: string[]
    hasTurnaround: boolean
    turnaround: string
  },
): Promise<{ variantId: number }> {
  const [variant] = await sql`
    INSERT INTO workout_variants (
      family_id, label, sort_order, raw_input, has_turnaround, turnaround,
      energy_system, hr_zone, rpe, dist_time, race_types, training_phases
    ) VALUES (
      ${familyId}, ${w.label}, ${w.sortOrder}, ${w.instructions}, ${w.hasTurnaround}, ${w.turnaround},
      ${w.energySystem}, ${w.hrZone}, ${w.rpe}, ${w.distTime}, ${w.raceTypes}, ${w.trainingPhases}
    )
    RETURNING id
  `
  return { variantId: variant.id as number }
}

// Deletes a variant; if it was the last variant in its family, the now-empty
// family row goes too, so a delete never leaves an orphan parent behind.
export async function dbDeleteWorkoutVariant(variantId: number): Promise<void> {
  const [variant] = await sql`SELECT family_id FROM workout_variants WHERE id = ${variantId}`
  if (!variant) throw new WorkoutVariantNotFoundError(variantId)
  const familyId = variant.family_id as number

  await sql`DELETE FROM workout_variants WHERE id = ${variantId}`

  const [remaining] = await sql`SELECT count(*)::int AS count FROM workout_variants WHERE family_id = ${familyId}`
  if ((remaining.count as number) === 0) {
    await sql`DELETE FROM workout_families WHERE id = ${familyId}`
  }
}

// #404: adopt = add a library-membership row (a run references a route it did not
// create). Idempotent via the PK — adopting twice is a no-op, not an error. Never
// touches workout_families: the canonical route, its content, and its creator credit
// (run_group_id) all stay put — adoption is a reference, not a copy.
export async function dbAdoptRoute(runId: string, familyId: number): Promise<void> {
  await sql`
    INSERT INTO run_workouts (run_id, family_id) VALUES (${runId}, ${familyId})
    ON CONFLICT (run_id, family_id) DO NOTHING
  `
}

// #404: un-adopt = drop this run's membership row only. Removes the route from THIS
// run's library, never the canonical route or any other run's membership — the
// opposite of dbDeleteWorkoutVariant (which is a global delete). Idempotent: a
// missing row is a no-op.
export async function dbUnadoptRoute(runId: string, familyId: number): Promise<void> {
  await sql`DELETE FROM run_workouts WHERE run_id = ${runId} AND family_id = ${familyId}`
}

export async function dbFlagWorkoutVariant(variantId: number, flagNote: string): Promise<void> {
  const rows = await sql`
    UPDATE workout_variants SET flagged = true, flag_note = ${flagNote}
    WHERE id = ${variantId}
    RETURNING id
  `
  if (rows.length === 0) throw new WorkoutVariantNotFoundError(variantId)
}

export async function dbFixWorkoutVariantAndClearFlag(
  variantId: number,
  fields: { reason: string; distTime: string; instructions: string },
): Promise<void> {
  const [variant] = await sql`SELECT family_id FROM workout_variants WHERE id = ${variantId}`
  if (!variant) throw new WorkoutVariantNotFoundError(variantId)
  const familyId = variant.family_id as number

  await sql`UPDATE workout_families SET reason = ${fields.reason} WHERE id = ${familyId}`
  await sql`
    UPDATE workout_variants SET
      dist_time = ${fields.distTime},
      raw_input = ${fields.instructions},
      flagged = false,
      flag_note = ''
    WHERE id = ${variantId}
  `
}

// Merges variants from one or more families into a single new family (family_id
// is a real workout_families row, so a merge always creates one new family
// rather than renaming rows in place). Family-level fields (category/type/
// reason/author/coaching_notes/map_link/run_group_id) come from whichever
// selected variant's family sorts first — merging variants
// that previously had different category/type is a real, deliberate
// simplification the family/variant model forces (variants can no longer
// disagree on those fields the way standalone `workouts` rows could).
// Sequential queries, not sql.transaction(), for the same reason as
// dbInsertWorkoutVariant: each step depends on the previous step's result,
// which the neon serverless driver's transaction() doesn't support.
export async function dbRegroupVariants(
  newName: string,
  variants: Array<{ variantId: number; label: string; sortOrder: number }>,
): Promise<void> {
  if (variants.length === 0) return

  const [first] = await sql`SELECT family_id FROM workout_variants WHERE id = ${variants[0].variantId}`
  if (!first) throw new WorkoutVariantNotFoundError(variants[0].variantId)
  const [sourceFamily] = await sql`
    SELECT category, type, reason, author, coaching_notes, map_link, run_group_id
    FROM workout_families WHERE id = ${first.family_id as number}
  `

  const [newFamily] = await sql`
    INSERT INTO workout_families (name, category, type, reason, author, coaching_notes, map_link, run_group_id)
    VALUES (
      ${newName}, ${sourceFamily.category}, ${sourceFamily.type}, ${sourceFamily.reason},
      ${sourceFamily.author}, ${sourceFamily.coaching_notes}, ${sourceFamily.map_link}, ${sourceFamily.run_group_id}
    )
    RETURNING id
  `
  const newFamilyId = newFamily.id as number

  const sourceFamilyIds = new Set<number>([first.family_id as number])
  for (const v of variants) {
    const [row] = await sql`SELECT family_id FROM workout_variants WHERE id = ${v.variantId}`
    if (!row) throw new WorkoutVariantNotFoundError(v.variantId)
    sourceFamilyIds.add(row.family_id as number)
    await sql`
      UPDATE workout_variants SET family_id = ${newFamilyId}, label = ${v.label}, sort_order = ${v.sortOrder}
      WHERE id = ${v.variantId}
    `
  }

  // #404: the merged family inherits library membership from every source family, so a
  // regroup never drops the workout out of any run's "Your run." Must run BEFORE the
  // orphan cleanup below — deleting an empty source family CASCADE-removes its
  // run_workouts rows, so we copy them onto the new family first. ON CONFLICT keeps it
  // idempotent when two source families shared a run.
  for (const familyId of sourceFamilyIds) {
    await sql`
      INSERT INTO run_workouts (run_id, family_id)
      SELECT run_id, ${newFamilyId} FROM run_workouts WHERE family_id = ${familyId}
      ON CONFLICT (run_id, family_id) DO NOTHING
    `
  }

  // Clean up any source families left with zero variants after the move —
  // same orphan-family rule as dbDeleteWorkoutVariant.
  for (const familyId of sourceFamilyIds) {
    const [remaining] = await sql`SELECT count(*)::int AS count FROM workout_variants WHERE family_id = ${familyId}`
    if ((remaining.count as number) === 0) {
      await sql`DELETE FROM workout_families WHERE id = ${familyId}`
    }
  }
}

// ── Schedule horizon generation ───────────────────────────────────────────────

const DAY_MAP: Record<string, 0 | 1 | 2 | 3 | 4 | 5 | 6> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
}

function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// Idempotent — safe to call on every page load.
// Creates weekly schedule entries for `runId` up to 24 weeks from today,
// using the run's day_of_week and rotation roster.
// (24-week horizon locked with Lou for #310; the cron-driven horizon + unbounded
// "Show more" button is deferred to its own future story.)
export async function generateScheduleHorizon(
  runId: string,
  dayOfWeek: string,
  roster: RunLeader[],
): Promise<void> {
  const horizonDate = new Date()
  horizonDate.setDate(horizonDate.getDate() + 24 * 7)
  const horizon = toYMD(horizonDate)

  // Find last existing entry for this run
  const lastRows = await sql`
    SELECT date, leader FROM schedule
    WHERE run_id = ${runId}
    ORDER BY date DESC LIMIT 1
  `
  const lastEntry = lastRows[0] ?? null
  const lastLeader = (lastEntry?.leader as string | null) ?? null

  // Existing dates for this run, fetched once up front. Replaces a per-week
  // SELECT (up to 24 sequential Neon round-trips during the initial fill) with a
  // single query; membership is then checked in memory. ON CONFLICT (date, run_id)
  // below is still the backstop for two page loads generating concurrently.
  const existingRows = await sql`SELECT date FROM schedule WHERE run_id = ${runId}`
  const existing = new Set(existingRows.map(r => toDateString(r.date)))

  // #319: fetch this run's workout-type cycle once up front. Each newly generated
  // week's workout_type is resolved from it (blank for cycle_mode 'none'). Folds a
  // single SELECT into a function that already issues per-run queries on page load.
  const cycleRows = await sql`SELECT cycle_mode, cycle FROM runs WHERE id = ${runId}`
  const cycleMode = (cycleRows[0]?.cycle_mode as string | null) ?? null
  const cycle = (cycleRows[0]?.cycle as Record<string, string> | null) ?? null

  // Find the next date to generate from
  const targetDay = DAY_MAP[dayOfWeek] ?? 2 // default Tuesday

  // NOTE: getDay()/setDate() are LOCAL-time; toYMD()/horizon use UTC (toISOString).
  // These agree on Vercel (UTC runtime, where this always runs); they could differ
  // only if generation ran from a machine in a timezone behind UTC.
  const cursor = lastEntry
    ? new Date(toDateString(lastEntry.date) + 'T00:00:00')
    : new Date()

  // Advance cursor to the first occurrence of targetDay on or after cursor
  while (cursor.getDay() !== targetDay) {
    cursor.setDate(cursor.getDate() + 1)
  }
  // Move one week forward if we're starting from the last entry's date
  if (lastEntry) cursor.setDate(cursor.getDate() + 7)

  let currentLeader = lastLeader

  while (toYMD(cursor) <= horizon) {
    const dateStr = toYMD(cursor)

    if (!existing.has(dateStr)) {
      const nextLeader = getNextLeader(roster, currentLeader ?? '', dateStr)
      const workoutType = resolveWorkoutType(cycleMode, cycle, dateStr)
      await sql`
        INSERT INTO schedule (date, run_id, workout_type, leader, needs_leader)
        VALUES (${dateStr}::date, ${runId}, ${workoutType}, ${nextLeader ?? ''}, ${nextLeader === null})
        ON CONFLICT (date, run_id) DO NOTHING
      `
      currentLeader = nextLeader ?? currentLeader
    }

    cursor.setDate(cursor.getDate() + 7)
  }
}

// ── Aggregate read, cached ──────────────────────────────────────────────────

export const fetchData = unstable_cache(
  async () => {
    // Isolated from the Promise.all below: a workout_variants/workout_families
    // query failure (e.g. a Preview branch where the migration hasn't run yet —
    // has happened twice before, #238/#272) shouldn't blank out schedule/races
    // too, which have nothing to do with this table.
    let workoutVariants: WorkoutVariantRow[] = []
    try {
      workoutVariants = await fetchWorkoutVariants()
    } catch {
      workoutVariants = []
    }
    try {
      const [schedule, races] = await Promise.all([
        fetchSchedule(),
        fetchRaces(),
      ])
      return { schedule, races, workoutVariants }
    } catch {
      return { schedule: [], races: [], workoutVariants }
    }
  },
  ['fetchData'],
  { revalidate: 300, tags: ['tigerwolves-data'] },
)

// Get a run's config by ID (public query, no auth check). Used by per-run pages
// that are readable by any user (logged out, runner, non-owning leader).
export async function getRunById(runId: string): Promise<RunConfig | null> {
  const rows = await sql`
    SELECT id, name, emoji, description, day_of_week, meeting_time, meeting_location,
           post_header, leader_intro, closing_notes,
           kind, workout_types, run_group_id, cycle_mode, cycle, status, post_template
    FROM runs
    WHERE id = ${runId}
    LIMIT 1
  `
  if (!rows[0]) return null
  const r = rows[0]
  return {
    id: r.id as string,
    name: r.name as string,
    emoji: (r.emoji as string | null) ?? null,
    description: (r.description as string | null) ?? null,
    dayOfWeek: r.day_of_week as string,
    meetingTime: (r.meeting_time as string | null) ?? null,
    meetingLocation: r.meeting_location as string,
    postHeader: r.post_header as string,
    leaderIntro: (r.leader_intro as string | null) ?? 'Run Leaders:',
    closingNotes: r.closing_notes as string,
    kind: (r.kind as string | null) ?? '',
    workoutTypes: (r.workout_types as string[]) ?? [],
    runGroupId: (r.run_group_id as number | null) ?? null,
    cycleMode: (r.cycle_mode as string | null) ?? 'none',
    cycle: (r.cycle as Record<string, string> | null) ?? {},
    status: (r.status as string | null) ?? 'live',
    postTemplate: (r.post_template as string | null) ?? null,
  }
}

// #360: all runs in the platform's runs table, with the fields needed to render
// a directory card and link out to the NBR directory entry. Plain uncached read;
// the All Runs page is already dynamic via currentUser() and doesn't need an
// additional cache layer here.
export type DirectoryRun = {
  id: string
  name: string
  day_of_week: string | null
  meeting_time: string | null
  meeting_location: string | null
  kind: string | null
  emoji: string | null
  nbr_directory_id: string | null
  status: string
}

export async function getDirectoryRuns(): Promise<DirectoryRun[]> {
  const rows = await sql`
    SELECT id, name, day_of_week, meeting_time, meeting_location, kind, emoji, nbr_directory_id, status
    FROM runs ORDER BY id
  `
  return rows.map(r => ({
    id: r.id as string,
    name: r.name as string,
    day_of_week: (r.day_of_week as string | null) ?? null,
    meeting_time: (r.meeting_time as string | null) ?? null,
    meeting_location: (r.meeting_location as string | null) ?? null,
    kind: (r.kind as string | null) ?? null,
    emoji: (r.emoji as string | null) ?? null,
    nbr_directory_id: (r.nbr_directory_id as string | null) ?? null,
    status: (r.status as string | null) ?? 'live',
  }))
}

// #361: NBR directory ids that already have a linked run, so the picker can exclude them.
export async function getActivatedNbrDirectoryIds(): Promise<string[]> {
  const rows = await sql`
    SELECT nbr_directory_id FROM runs WHERE nbr_directory_id IS NOT NULL
  `
  return rows.map(r => r.nbr_directory_id as string)
}

// #350: check whether a Clerk user leads ANY active run across the platform.
// Used by revokeLeaderRoleIfOrphaned to decide whether to strip the Clerk role.
export async function leadsAnyActiveRun(clerkUserId: string): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM run_leaders WHERE clerk_user_id = ${clerkUserId} AND active = true LIMIT 1
  `
  return rows.length > 0
}

// #330: run ids a signed-in user currently follows (their runner_follows rows).
export async function getFollowedRunIds(clerkUserId: string): Promise<string[]> {
  const rows = await sql`
    SELECT run_id FROM runner_follows WHERE clerk_user_id = ${clerkUserId}
  `
  return rows.map(r => r.run_id as string)
}

// #332: a leader always follows the run they lead, so it appears on their My Week
// without manually joining. Idempotent write-on-load — mirrors generateScheduleHorizon's
// precedent (INSERT during page render, no updateTag, which throws outside a Server
// Action). Callers must run this BEFORE reading getFollowedRunIds so the read
// reflects it (getFollowedRunIds is uncached; the ON CONFLICT makes repeat loads
// a no-op). Returns the auto-followed run id, or null if the user leads no run.
export async function ensureLeaderSelfFollow(clerkUserId: string): Promise<string | null> {
  const leaderRun = await getLeaderRun(clerkUserId)
  if (!leaderRun) return null
  await sql`
    INSERT INTO runner_follows (clerk_user_id, run_id)
    VALUES (${clerkUserId}, ${leaderRun.id})
    ON CONFLICT (clerk_user_id, run_id) DO NOTHING
  `
  return leaderRun.id
}

// #331 My Week — cross-run assembly over the runs a user follows, for the date
// window [windowStart, windowEnd] (inclusive). Deliberately does NOT use
// fetchData(): that path defaults to the tigerwolves run and would silently drop
// other followed runs' workouts. Each run is resolved independently via
// fetchWorkoutVariants(runId), which as of #347 returns the full shared catalog
// (no group scoping) — per-run resolution is by matching each run's schedule
// entries against that shared set. N per-run queries (N = followed runs, small at
// trial scale); cached under the 'tigerwolves-data' tag so follow changes
// (toggleRunFollow's updateTag) and workout edits both invalidate it.
async function assembleMyPlan(
  clerkUserId: string,
  windowStart: string,
  windowEnd: string,
): Promise<MyPlanItem[]> {
  const runIds = await getFollowedRunIds(clerkUserId)
  if (runIds.length === 0) return []

  const perRun = await Promise.all(
    runIds.map(async (runId): Promise<MyPlanItem[]> => {
      const run = await getRunById(runId)
      if (!run) return []
      const [schedule, variants] = await Promise.all([
        fetchSchedule(runId),
        fetchWorkoutVariants(runId),
      ])
      return schedule
        .filter(e => e.date >= windowStart && e.date <= windowEnd)
        .map(entry => ({
          run,
          date: entry.date,
          entry,
          workout: resolveWorkoutVariant(variants, entry.workoutName, entry.selectedVariations),
        }))
    }),
  )
  return perRun.flat()
}

export const getMyPlan = unstable_cache(
  (clerkUserId: string, windowStart: string, windowEnd: string) =>
    assembleMyPlan(clerkUserId, windowStart, windowEnd),
  ['getMyPlan'],
  { revalidate: 300, tags: ['tigerwolves-data'] },
)

// ── Admin index helpers (#378) ────────────────────────────────────────────────

// Returns per-run follower counts for the given run ids, keyed by runId.
// Runs with no followers in runner_follows are included with count 0 — the
// caller must not have to handle missing keys. One grouped query, not N queries.
export async function getFollowerCounts(runIds: string[]): Promise<Record<string, number>> {
  if (runIds.length === 0) return {}
  const rows = await sql`
    SELECT run_id, COUNT(*)::int AS count
    FROM runner_follows
    WHERE run_id = ANY(${runIds})
    GROUP BY run_id
  `
  const result: Record<string, number> = {}
  for (const id of runIds) {
    result[id] = 0
  }
  for (const r of rows) {
    result[r.run_id as string] = r.count as number
  }
  return result
}

// Returns active leaders grouped by run id for the given run ids.
// Only active = true rows are included; deactivated leaders are omitted.
// Each leader is shaped as { name, email }. One grouped query, not N queries.
export async function getActiveLeadersByRun(runIds: string[]): Promise<Record<string, { name: string; email: string | null }[]>> {
  if (runIds.length === 0) return {}
  const rows = await sql`
    SELECT run_id, name, email
    FROM run_leaders
    WHERE run_id = ANY(${runIds}) AND active = true
    ORDER BY run_id, sort_order ASC NULLS LAST, id ASC
  `
  const result: Record<string, { name: string; email: string | null }[]> = {}
  for (const id of runIds) {
    result[id] = []
  }
  for (const r of rows) {
    result[r.run_id as string].push({
      name: r.name as string,
      email: r.email as string | null,
    })
  }
  return result
}
