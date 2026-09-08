'use server'
import { currentUser } from '@clerk/nextjs/server'
import { updateTag } from 'next/cache'
import * as Sentry from '@sentry/nextjs'
import { sql } from '@/lib/db'
import { getLeaderRun } from '@/lib/db'

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
