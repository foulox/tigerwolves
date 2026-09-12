'use server'
import { currentUser, clerkClient } from '@clerk/nextjs/server'
import type { User } from '@clerk/nextjs/server'
import { updateTag } from 'next/cache'
import * as Sentry from '@sentry/nextjs'
import { sql, getLeaderRun, getRunRoster } from '@/lib/db'
import { getNextLeader } from '@/lib/rotation'
import { RUN_KINDS, WORKOUT_TYPE_OPTIONS } from '@/lib/runProfile'

/** Throws 'Forbidden' if the caller's run does not match runId. */
async function assertCallerOwnsRun(user: User, runId: string): Promise<void> {
  const run = await getLeaderRun(user.id)
  if (!run || run.id !== runId) throw new Error('Forbidden')
}

/** Fetches the run_id for a run_leaders row and asserts the caller owns it. */
async function assertCallerOwnsLeaderRow(user: User, leaderId: number): Promise<void> {
  const rows = await sql`SELECT run_id FROM run_leaders WHERE id = ${leaderId}`
  if (!rows[0]) throw new Error('Forbidden')
  await assertCallerOwnsRun(user, rows[0].run_id as string)
}

export async function savePostTemplate(data: {
  postHeader: string
  meetingLocation: string
  leaderIntro: string
  closingNotes: string
}): Promise<{ error?: string }> {
  try {
    const user = await currentUser()
    if (!user || user.publicMetadata?.role !== 'leader') return { error: 'Unauthorized' }
    const run = await getLeaderRun(user.id)
    if (!run) return { error: 'Run not found' }

    await sql`
      UPDATE runs SET
        post_header = ${data.postHeader},
        meeting_location = ${data.meetingLocation},
        leader_intro = ${data.leaderIntro},
        closing_notes = ${data.closingNotes}
      WHERE id = ${run.id}
    `
    updateTag('tigerwolves-data')
    return {}
  } catch (err) {
    Sentry.captureException(err)
    return { error: 'Failed to save' }
  }
}

export async function saveRunProfile(data: {
  kind: string
  workoutTypes: string[]
}): Promise<{ error?: string }> {
  try {
    const user = await currentUser()
    if (!user || user.publicMetadata?.role !== 'leader') return { error: 'Unauthorized' }
    const run = await getLeaderRun(user.id)
    if (!run) return { error: 'Run not found' }

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
      WHERE id = ${run.id}
    `
    updateTag('tigerwolves-data')
    return {}
  } catch (err) {
    Sentry.captureException(err)
    return { error: 'Failed to save' }
  }
}

export async function saveRotationOrder(
  orderedIds: number[]  // run_leader ids in new order
): Promise<{ error?: string }> {
  try {
    const user = await currentUser()
    if (!user || user.publicMetadata?.role !== 'leader') return { error: 'Unauthorized' }
    // Verify all IDs belong to the caller's run
    if (orderedIds.length > 0) {
      const run = await getLeaderRun(user.id)
      if (!run) return { error: 'Run not found' }
      const ownershipRows = await sql`
        SELECT run_id FROM run_leaders WHERE id = ANY(${orderedIds})
      `
      if (ownershipRows.some(r => (r.run_id as string) !== run.id)) return { error: 'Forbidden' }
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
    const user = await currentUser()
    if (!user || user.publicMetadata?.role !== 'leader') return { error: 'Unauthorized', reassignedCount: 0, noLeaderDates: [] }

    // Validate the range before writing — a reversed/blank range would append a
    // period that matches nothing (dates are compared as ISO strings). from/to
    // come from <input type="date"> so format is trusted; ordering is not.
    if (!period.from || !period.to || period.from > period.to) {
      return { error: 'Enter a valid date range (from on or before to)', reassignedCount: 0, noLeaderDates: [] }
    }

    // Verify caller owns the targeted leader row
    try {
      await assertCallerOwnsLeaderRow(user, leaderId)
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
      const dateStr = (row.date as Date).toISOString().slice(0, 10)
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
    const user = await currentUser()
    if (!user || user.publicMetadata?.role !== 'leader') return { error: 'Unauthorized' }
    // Verify caller owns the targeted leader row
    try {
      await assertCallerOwnsLeaderRow(user, leaderId)
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
    const user = await currentUser()
    if (!user || user.publicMetadata?.role !== 'leader') return { error: 'Unauthorized' }
    // Verify caller owns the target run
    try {
      await assertCallerOwnsRun(user, runId)
    } catch {
      return { error: 'Forbidden' }
    }

    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) return { error: 'Enter an email address' }

    // A leader can only be added if the email already belongs to a Clerk account.
    // We store their clerk_user_id at add-time so getLeaderRun() recognizes them at
    // login — a run_leaders row with no clerk_user_id is invisible to the leader
    // surfaces, which is the linkage gap this rework closes. Reject unknown emails.
    const client = await clerkClient()
    const { data: matches } = await client.users.getUserList({ emailAddress: [normalizedEmail] })
    const clerkUser = matches.find(u =>
      u.emailAddresses.some(e => e.emailAddress.toLowerCase() === normalizedEmail)
    )
    if (!clerkUser) {
      return { error: 'No account found for that email — they need to sign in once before they can be added.' }
    }

    const name =
      [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ').trim() ||
      clerkUser.username ||
      normalizedEmail.split('@')[0]

    const maxOrder = await sql`SELECT MAX(sort_order) AS m FROM run_leaders WHERE run_id = ${runId}`
    const nextOrder = ((maxOrder[0].m as number | null) ?? 0) + 1
    // ON CONFLICT is keyed on (run_id, name), which doubles as the re-add/reactivate
    // path for a previously-removed leader. Edge case: two distinct Clerk accounts
    // with the identical display name in one run would collide here and the second
    // add would overwrite the first's clerk_user_id/email. Acceptable for the trial
    // (a run's leaders are a handful of known people); revisit if runs get larger.
    await sql`
      INSERT INTO run_leaders (run_id, name, email, clerk_user_id, sort_order, active)
      VALUES (${runId}, ${name}, ${normalizedEmail}, ${clerkUser.id}, ${nextOrder}, true)
      ON CONFLICT (run_id, name) DO UPDATE SET
        email = ${normalizedEmail},
        clerk_user_id = ${clerkUser.id},
        active = true
    `
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
    const user = await currentUser()
    if (!user || user.publicMetadata?.role !== 'leader') return { error: 'Unauthorized', reassignedCount: 0, noLeaderDates: [] }
    // Verify caller owns the targeted leader row
    try {
      await assertCallerOwnsLeaderRow(user, leaderId)
    } catch {
      return { error: 'Forbidden', reassignedCount: 0, noLeaderDates: [] }
    }

    // Look up the leader's name + run before deactivating.
    const leaderRows = await sql`SELECT name, run_id FROM run_leaders WHERE id = ${leaderId}`
    if (!leaderRows[0]) return { error: 'Not found', reassignedCount: 0, noLeaderDates: [] }
    const leaderName = leaderRows[0].name as string
    const runId = leaderRows[0].run_id as string

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
      const dateStr = (row.date as Date).toISOString().slice(0, 10)
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

    updateTag('tigerwolves-data')
    return { reassignedCount, noLeaderDates }
  } catch (err) {
    Sentry.captureException(err)
    return { error: 'Failed to remove leader', reassignedCount: 0, noLeaderDates: [] }
  }
}
