'use server'
import { currentUser } from '@clerk/nextjs/server'
import { updateTag } from 'next/cache'
import * as Sentry from '@sentry/nextjs'
import { sql, getLeaderRun, getRunRoster } from '@/lib/db'
import { getNextLeader } from '@/lib/rotation'

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

export async function saveRotationOrder(
  orderedIds: number[]  // run_leader ids in new order
): Promise<{ error?: string }> {
  try {
    const user = await currentUser()
    if (!user || user.publicMetadata?.role !== 'leader') return { error: 'Unauthorized' }
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
      // Find the previous leader (the one before this leader in rotation on this date)
      // Then advance from them to skip the away leader
      const beforeIdx = roster.findIndex(l => l.name === leaderName)
      const prevLeader = roster[(beforeIdx - 1 + roster.length) % roster.length]
      const next = getNextLeader(roster, prevLeader.name, dateStr)

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
    // Look up Clerk user by email to get their name
    // Note: Clerk Admin API is needed here — use process.env.CLERK_SECRET_KEY
    // Simplest approach: insert with email, name defaults to email prefix until they sign in
    const name = email.split('@')[0]
    const maxOrder = await sql`SELECT MAX(sort_order) AS m FROM run_leaders WHERE run_id = ${runId}`
    const nextOrder = ((maxOrder[0].m as number | null) ?? 0) + 1
    await sql`
      INSERT INTO run_leaders (run_id, name, email, sort_order, active)
      VALUES (${runId}, ${name}, ${email}, ${nextOrder}, true)
      ON CONFLICT (run_id, name) DO UPDATE SET email = ${email}, active = true
    `
    updateTag('tigerwolves-data')
    return {}
  } catch (err) {
    Sentry.captureException(err)
    return { error: 'Failed to add leader' }
  }
}

export async function removeRunLeader(leaderId: number): Promise<{ error?: string }> {
  try {
    const user = await currentUser()
    if (!user || user.publicMetadata?.role !== 'leader') return { error: 'Unauthorized' }
    await sql`UPDATE run_leaders SET active = false WHERE id = ${leaderId}`
    updateTag('tigerwolves-data')
    return {}
  } catch (err) {
    Sentry.captureException(err)
    return { error: 'Failed to remove leader' }
  }
}
