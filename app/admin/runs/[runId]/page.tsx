import { notFound } from 'next/navigation'
import { requireAdminPage } from '@/lib/requireAdminPage'
import { getRunById, getRunRoster, fetchWorkoutVariants, fetchSchedule, generateScheduleHorizon } from '@/lib/db'
import RunConfigClient from '@/components/RunConfigClient'

// #378: Admin per-run manage page. Mirrors app/run-config/page.tsx exactly —
// same RunConfigClient surface, same prop shapes — but resolves the run by the
// [runId] route param instead of getLeaderRun(you). Requires admin role (non-admins
// are redirected to '/' by requireAdminPage). Missing run id → notFound().
export default async function AdminRunManagePage({ params }: { params: Promise<{ runId: string }> }) {
  // Next 16: params is a Promise and must be awaited before use.
  const { runId } = await params
  const admin = await requireAdminPage()
  const runConfig = await getRunById(runId)

  if (!runConfig) notFound()

  const runLeaders = await getRunRoster(runConfig.id)
  const roster = [...runLeaders].sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999)).map(l => l.name)

  await generateScheduleHorizon(runConfig.id, runConfig.dayOfWeek, runLeaders)
  const [schedule, variants] = await Promise.all([
    fetchSchedule(runConfig.id),
    fetchWorkoutVariants(runConfig.id),
  ])
  const today = new Date().toISOString().slice(0, 10)
  const nextEntry = schedule.filter(e => e.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null

  return <RunConfigClient runConfig={runConfig} runLeaders={runLeaders} currentUserId={admin.id}
           nextEntry={nextEntry} roster={roster} variants={variants} />
}
