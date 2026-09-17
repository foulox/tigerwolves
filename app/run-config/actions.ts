'use server'
import { currentUser } from '@clerk/nextjs/server'
import type { User } from '@clerk/nextjs/server'
import { updateTag } from 'next/cache'
import * as Sentry from '@sentry/nextjs'
import { sql, getLeaderRun, getRunRoster, toDateString } from '@/lib/db'
import { getNextLeader } from '@/lib/rotation'
import { RUN_KINDS, WORKOUT_TYPE_OPTIONS, WEEK_SLOTS, parseSlotValue, joinSlotValue } from '@/lib/runProfile'
import { RunIdentityValues, validateRunIdentity } from '@/lib/runIdentity'
import { resolveClerkUserByEmail, leaderDisplayName, grantLeaderRole, revokeLeaderRoleIfOrphaned } from '@/lib/runLeaders'

/** True if the Clerk user carries the cross-run admin flag (mirrors setRunStatus). */
function isAdminUser(user: User): boolean {
  return user.publicMetadata?.admin === true
}

/**
 * Opening auth gate for every run-config write action. An admin (admin:true)
 * passes even with no leader role; a signed-in non-admin non-leader is rejected.
 * Returns the user on success, or null when the caller must be refused Unauthorized.
 */
async function authorizeWriteCaller(): Promise<User | null> {
  const user = await currentUser()
  if (!user) return null
  if (!isAdminUser(user) && user.publicMetadata?.role !== 'leader') return null
  return user
}

/**
 * Admin-or-owner run guard. Allows admins across any run; otherwise falls back to
 * the existing getLeaderRun ownership check. Throws 'Forbidden' for a non-admin
 * caller who does not lead runId. This is the single enforcement point for the
 * admin bypass + Forbidden path on run-addressed actions.
 */
async function assertCanManageRun(user: User, runId: string): Promise<void> {
  if (isAdminUser(user)) return
  const run = await getLeaderRun(user.id)
  if (!run || run.id !== runId) throw new Error('Forbidden')
}

/**
 * Admin-or-owner guard for a run_leaders roster row. Admins pass; otherwise the
 * caller must lead the run that owns the row. Throws 'Forbidden' if the row is
 * missing or the non-admin caller does not own it.
 */
async function assertCanManageLeaderRow(user: User, leaderId: number): Promise<void> {
  if (isAdminUser(user)) return
  const rows = await sql`SELECT run_id FROM run_leaders WHERE id = ${leaderId}`
  if (!rows[0]) throw new Error('Forbidden')
  await assertCanManageRun(user, rows[0].run_id as string)
}

export async function setRunStatus(
  runId: string,
  status: 'draft' | 'live'
): Promise<{ error?: string; status?: 'draft' | 'live' }> {
  try {
    const user = await authorizeWriteCaller()
    if (!user) return { error: 'Unauthorized' }
    try {
      await assertCanManageRun(user, runId)
    } catch {
      return { error: 'Forbidden' }
    }

    if (status !== 'draft' && status !== 'live') return { error: 'Invalid status' }

    await sql`UPDATE runs SET status = ${status} WHERE id = ${runId}`
    updateTag('tigerwolves-data')
    return { status }
  } catch (err) {
    Sentry.captureException(err)
    return { error: 'Failed to update status' }
  }
}

export async function savePostTemplate(runId: string, data: { postTemplate: string }): Promise<{ error?: string }> {
  try {
    const user = await authorizeWriteCaller()
    if (!user) return { error: 'Unauthorized' }
    try { await assertCanManageRun(user, runId) } catch { return { error: 'Forbidden' } }

    await sql`UPDATE runs SET post_template = ${data.postTemplate} WHERE id = ${runId}`
    updateTag('tigerwolves-data')
    return {}
  } catch (err) {
    Sentry.captureException(err)
    return { error: 'Failed to save' }
  }
}

export async function saveRunProfile(runId: string, data: {
  kind: string
  workoutTypes: string[]
}): Promise<{ error?: string }> {
  try {
    const user = await authorizeWriteCaller()
    if (!user) return { error: 'Unauthorized' }
    try {
      await assertCanManageRun(user, runId)
    } catch {
      return { error: 'Forbidden' }
    }

    if (!(RUN_KINDS as readonly string[]).includes(data.kind)) return { error: 'Invalid run kind' }
    // The allowlist only applies to Workout runs — drop unknown types, and clear it
    // entirely for any other kind so a non-Workout run never carries a stale allowlist.
    const allowed = new Set<string>(WORKOUT_TYPE_OPTIONS)
    const workoutTypes =
      data.kind === 'Workout' ? data.workoutTypes.filter(t => allowed.has(t)) : []

    // run_group_id is intentionally not written here — it's foundational (set at
    // provisioning in #318), not a leader-editable profile field. This action only
    // touches the two fields the About tab edits.
    await sql`
      UPDATE runs SET kind = ${data.kind}, workout_types = ${workoutTypes}::text[]
      WHERE id = ${runId}
    `
    updateTag('tigerwolves-data')
    return {}
  } catch (err) {
    Sentry.captureException(err)
    return { error: 'Failed to save' }
  }
}

export async function saveRunIdentity(runId: string, data: RunIdentityValues): Promise<{ error?: string }> {
  try {
    const user = await authorizeWriteCaller()
    if (!user) return { error: 'Unauthorized' }
    try {
      await assertCanManageRun(user, runId)
    } catch {
      return { error: 'Forbidden' }
    }
    const invalid = validateRunIdentity(data)
    if (invalid.error) return { error: invalid.error }

    await sql`
      UPDATE runs SET
        name = ${data.name.trim()},
        day_of_week = ${data.dayOfWeek},
        emoji = ${data.emoji},
        meeting_time = ${data.meetingTime},
        meeting_location = ${data.meetingLocation},
        description = ${data.description},
        warmup_description = ${data.warmupDescription}
      WHERE id = ${runId}
    `
    updateTag('tigerwolves-data')
    return {}
  } catch (err) {
    Sentry.captureException(err)
    return { error: 'Failed to save' }
  }
}

export async function saveRunCycle(runId: string, data: {
  cycleMode: string
  cycle: Record<string, string>
}): Promise<{ error?: string }> {
  try {
    const user = await authorizeWriteCaller()
    if (!user) return { error: 'Unauthorized' }
    try {
      await assertCanManageRun(user, runId)
    } catch {
      return { error: 'Forbidden' }
    }

    if (data.cycleMode !== 'none' && data.cycleMode !== 'week_of_month') {
      return { error: 'Invalid cycle mode' }
    }

    // Sanitize the slot map server-side: keep only real week slots ("1".."5") and,
    // within each, only types on this run's own allowlist (#323 AC). A compound slot
    // keeps just its allowed parts; a slot left with nothing is dropped entirely.
    // 'none' carries no cadence, so it always stores an empty map — switching modes
    // never leaves a stale slot map behind.
    const cycle: Record<string, string> = {}
    if (data.cycleMode === 'week_of_month') {
      // Resolve the target run's own workout-type allowlist directly by runId, so
      // an admin editing a run they don't lead still validates against that run's
      // vocabulary (not the caller's).
      const allowlistRows = await sql`SELECT workout_types FROM runs WHERE id = ${runId}`
      const allowed = new Set<string>((allowlistRows[0]?.workout_types as string[] | null) ?? [])
      const validSlots = new Set<string>(WEEK_SLOTS.map(String))
      for (const [slot, value] of Object.entries(data.cycle)) {
        if (!validSlots.has(slot)) continue
        const kept = parseSlotValue(value).filter(t => allowed.has(t))
        if (kept.length > 0) cycle[slot] = joinSlotValue(kept)
      }
    }

    await sql`
      UPDATE runs SET cycle_mode = ${data.cycleMode}, cycle = ${JSON.stringify(cycle)}::jsonb
      WHERE id = ${runId}
    `
    updateTag('tigerwolves-data')
    return {}
  } catch (err) {
    Sentry.captureException(err)
    return { error: 'Failed to save' }
  }
}

export async function saveRotationOrder(
  runId: string,
  orderedIds: number[]  // run_leader ids in new order
): Promise<{ error?: string }> {
  try {
    const user = await authorizeWriteCaller()
    if (!user) return { error: 'Unauthorized' }
    try {
      await assertCanManageRun(user, runId)
    } catch {
      return { error: 'Forbidden' }
    }
    // Every id being reordered must belong to the targeted run — even an admin may
    // only reorder within one run, never move a row across runs.
    if (orderedIds.length > 0) {
      const ownershipRows = await sql`
        SELECT run_id FROM run_leaders WHERE id = ANY(${orderedIds})
      `
      if (ownershipRows.some(r => (r.run_id as string) !== runId)) return { error: 'Forbidden' }
    }
    for (let i = 0; i < orderedIds.length; i++) {
      await sql`UPDATE run_leaders SET sort_order = ${i + 1} WHERE id = ${orderedIds[i]}`
    }
    updateTag('tigerwolves-data')
    return {}
  } catch (err) {
    Sentry.captureException(err)
    return { error: 'Failed to save order' }
  }
}

export async function saveAwayPeriod(
  leaderId: number,
  period: { from: string; to: string }
): Promise<{ error?: string; reassignedCount: number; noLeaderDates: string[] }> {
  try {
    const user = await authorizeWriteCaller()
    if (!user) return { error: 'Unauthorized', reassignedCount: 0, noLeaderDates: [] }

    // Validate the range before writing — a reversed/blank range would append a
    // period that matches nothing (dates are compared as ISO strings). from/to
    // come from <input type="date"> so format is trusted; ordering is not.
    if (!period.from || !period.to || period.from > period.to) {
      return { error: 'Enter a valid date range (from on or before to)', reassignedCount: 0, noLeaderDates: [] }
    }

    // Verify the caller may manage the targeted leader row (admin or owning leader)
    try {
      await assertCanManageLeaderRow(user, leaderId)
    } catch {
      return { error: 'Forbidden', reassignedCount: 0, noLeaderDates: [] }
    }

    // Append period to away_periods
    await sql`
      UPDATE run_leaders
      SET away_periods = away_periods || ${JSON.stringify([period])}::jsonb
      WHERE id = ${leaderId}
    `

    // Find this leader's name and run_id
    const leaderRows = await sql`SELECT name, run_id FROM run_leaders WHERE id = ${leaderId}`
    const leaderName = leaderRows[0].name as string
    const runId = leaderRows[0].run_id as string

    // Get full roster for reassignment
    const roster = await getRunRoster(runId)

    // Find schedule entries in range assigned to this leader
    const affected = await sql`
      SELECT date FROM schedule
      WHERE run_id = ${runId}
        AND leader = ${leaderName}
        AND date >= ${period.from}::date
        AND date <= ${period.to}::date
      ORDER BY date ASC
    `

    let reassignedCount = 0
    const noLeaderDates: string[] = []

    for (const row of affected) {
      const dateStr = toDateString(row.date)
      // Use the actual leader from the schedule entry immediately before this date as the
      // anchor for getNextLeader. Positional roster math is wrong after manual overrides.
      const prevEntryRows = await sql`
        SELECT leader FROM schedule
        WHERE run_id = ${runId}
          AND date < ${dateStr}::date
        ORDER BY date DESC
        LIMIT 1
      `
      let anchorLeader: string
      if (prevEntryRows.length > 0) {
        anchorLeader = prevEntryRows[0].leader as string
      } else {
        // No prior entry — fall back to positional roster predecessor
        const beforeIdx = roster.findIndex(l => l.name === leaderName)
        anchorLeader = roster[(beforeIdx - 1 + roster.length) % roster.length].name
      }
      const next = getNextLeader(roster, anchorLeader, dateStr)

      if (next === null) {
        await sql`UPDATE schedule SET needs_leader = true WHERE date = ${dateStr}::date AND run_id = ${runId}`
        noLeaderDates.push(dateStr)
      } else {
        await sql`UPDATE schedule SET leader = ${next}, needs_leader = null WHERE date = ${dateStr}::date AND run_id = ${runId}`
        reassignedCount++
      }
    }

    updateTag('tigerwolves-data')
    return { reassignedCount, noLeaderDates }
  } catch (err) {
    Sentry.captureException(err)
    return { error: 'Failed to save away period', reassignedCount: 0, noLeaderDates: [] }
  }
}

export async function removeAwayPeriod(
  leaderId: number,
  periodIndex: number
): Promise<{ error?: string }> {
  try {
    const user = await authorizeWriteCaller()
    if (!user) return { error: 'Unauthorized' }
    // Verify the caller may manage the targeted leader row (admin or owning leader)
    try {
      await assertCanManageLeaderRow(user, leaderId)
    } catch {
      return { error: 'Forbidden' }
    }
    // Remove element at periodIndex from JSONB array
    await sql`
      UPDATE run_leaders
      SET away_periods = away_periods - ${periodIndex}
      WHERE id = ${leaderId}
    `
    updateTag('tigerwolves-data')
    return {}
  } catch (err) {
    Sentry.captureException(err)
    return { error: 'Failed to remove period' }
  }
}

export async function addRunLeaderByEmail(
  runId: string,
  email: string
): Promise<{ error?: string }> {
  try {
    const user = await authorizeWriteCaller()
    if (!user) return { error: 'Unauthorized' }
    // Verify the caller may manage the target run (admin or owning leader)
    try {
      await assertCanManageRun(user, runId)
    } catch {
      return { error: 'Forbidden' }
    }

    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) return { error: 'Enter an email address' }

    // A leader can only be added if the email already belongs to a Clerk account.
    // We store their clerk_user_id at add-time so getLeaderRun() recognizes them at
    // login — a run_leaders row with no clerk_user_id is invisible to the leader
    // surfaces, which is the linkage gap this rework closes. Reject unknown emails.
    const clerkUser = await resolveClerkUserByEmail(normalizedEmail)
    if (!clerkUser) {
      return { error: 'No account found for that email — they need to sign in once before they can be added.' }
    }

    const name = leaderDisplayName(clerkUser, normalizedEmail)

    const maxOrder = await sql`SELECT MAX(sort_order) AS m FROM run_leaders WHERE run_id = ${runId}`
    const nextOrder = ((maxOrder[0].m as number | null) ?? 0) + 1
    // ON CONFLICT is keyed on (run_id, email) — email is the stable identity across
    // Clerk instances (#385). This doubles as the re-add/reactivate path: adding
    // someone already a leader of this run (same email, possibly a different display
    // name) updates the existing row instead of inserting a second. `name` is set
    // only on insert (not clobbered on conflict) so the existing display name is kept.
    await sql`
      INSERT INTO run_leaders (run_id, name, email, clerk_user_id, sort_order, active)
      VALUES (${runId}, ${name}, ${normalizedEmail}, ${clerkUser.id}, ${nextOrder}, true)
      ON CONFLICT (run_id, email) WHERE email IS NOT NULL DO UPDATE SET
        clerk_user_id = ${clerkUser.id},
        active = true
    `

    // Grant the Clerk 'leader' role — merges with existing publicMetadata so
    // any existing admin: true (or other flags) are never clobbered.
    await grantLeaderRole(clerkUser)

    updateTag('tigerwolves-data')
    return {}
  } catch (err) {
    Sentry.captureException(err)
    return { error: 'Failed to add leader' }
  }
}

export async function removeRunLeader(
  leaderId: number
): Promise<{ error?: string; reassignedCount: number; noLeaderDates: string[] }> {
  try {
    const user = await authorizeWriteCaller()
    if (!user) return { error: 'Unauthorized', reassignedCount: 0, noLeaderDates: [] }
    // Verify the caller may manage the targeted leader row (admin or owning leader)
    try {
      await assertCanManageLeaderRow(user, leaderId)
    } catch {
      return { error: 'Forbidden', reassignedCount: 0, noLeaderDates: [] }
    }

    // Look up the leader's name, run, and Clerk user id before deactivating.
    const leaderRows = await sql`SELECT name, run_id, clerk_user_id FROM run_leaders WHERE id = ${leaderId}`
    if (!leaderRows[0]) return { error: 'Not found', reassignedCount: 0, noLeaderDates: [] }
    const leaderName = leaderRows[0].name as string
    const runId = leaderRows[0].run_id as string
    const removedClerkUserId = leaderRows[0].clerk_user_id as string | null

    // Deactivate first so the reassignment roster excludes the removed leader.
    await sql`UPDATE run_leaders SET active = false WHERE id = ${leaderId}`

    // Roster now excludes the removed leader (getRunRoster filters active = true).
    const roster = await getRunRoster(runId)

    // Reassign this leader's FUTURE weeks (today onward) to the next available leader
    // in rotation. Past weeks are left as an audit trail. Mirrors saveAwayPeriod's scan.
    const affected = await sql`
      SELECT date FROM schedule
      WHERE run_id = ${runId} AND leader = ${leaderName} AND date >= CURRENT_DATE
      ORDER BY date ASC
    `

    let reassignedCount = 0
    const noLeaderDates: string[] = []

    for (const row of affected) {
      const dateStr = toDateString(row.date)
      // Anchor on the actual leader of the entry immediately before this date so the
      // rotation continues naturally (and picks up prior reassignments in this loop).
      const prevEntryRows = await sql`
        SELECT leader FROM schedule
        WHERE run_id = ${runId} AND date < ${dateStr}::date
        ORDER BY date DESC LIMIT 1
      `
      const anchorLeader = prevEntryRows[0] ? (prevEntryRows[0].leader as string) : ''
      const next = getNextLeader(roster, anchorLeader, dateStr)

      if (next === null) {
        await sql`UPDATE schedule SET needs_leader = true WHERE date = ${dateStr}::date AND run_id = ${runId}`
        noLeaderDates.push(dateStr)
      } else {
        await sql`UPDATE schedule SET leader = ${next}, needs_leader = null WHERE date = ${dateStr}::date AND run_id = ${runId}`
        reassignedCount++
      }
    }

    // Conditionally revoke the Clerk 'leader' role — only if this person no
    // longer leads any other active run. Row is already deactivated above, so
    // leadsAnyActiveRun will return false for the removed run. Skip entirely if
    // the row had no clerk_user_id (legacy row without Clerk linkage).
    if (removedClerkUserId) {
      await revokeLeaderRoleIfOrphaned(removedClerkUserId)
    }

    updateTag('tigerwolves-data')
    return { reassignedCount, noLeaderDates }
  } catch (err) {
    Sentry.captureException(err)
    return { error: 'Failed to remove leader', reassignedCount: 0, noLeaderDates: [] }
  }
}
