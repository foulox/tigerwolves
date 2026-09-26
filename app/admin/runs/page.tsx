import Link from 'next/link'
import { requireAdminPage } from '@/lib/requireAdminPage'
import Header from '@/components/Header'
import {
  getDirectoryRuns,
  getActiveLeadersByRun,
  getFollowerCounts,
} from '@/lib/db'

export default async function AdminRunsPage() {
  await requireAdminPage()

  const runs = (await getDirectoryRuns()).filter(r => r.status !== 'unclaimed')
  const runIds = runs.map(r => r.id)
  const [leadersByRun, followerCounts] = await Promise.all([
    getActiveLeadersByRun(runIds),
    getFollowerCounts(runIds),
  ])

  return (
    <div>
      <Header title="All Runs" isLeader={false} />
      <div className="px-4 pb-24 flex flex-col gap-3">
        {runs.map(run => {
          const leaders = leadersByRun[run.id] ?? []
          const followers = followerCounts[run.id] ?? 0
          return (
            <Link
              key={run.id}
              href={`/admin/runs/${run.id}`}
              className="block border border-gray-200 rounded-lg p-4 touch-manipulation hover:bg-gray-50"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-gray-900">
                  {run.emoji ? `${run.emoji} ${run.name}` : run.name}
                </span>
                {run.status === 'draft' && (
                  <span className="text-xs font-medium bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded">
                    Draft
                  </span>
                )}
              </div>
              <div className="text-sm text-gray-600">
                {leaders.length === 0
                  ? <span className="italic text-gray-400">No leaders</span>
                  : leaders.map((l, i) => (
                      <span key={`${l.email ?? 'noemail'}-${l.name}-${i}`} className="mr-3">
                        {l.name}{l.email ? ` (${l.email})` : ''}
                      </span>
                    ))
                }
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {followers} {followers === 1 ? 'follower' : 'followers'}
              </div>
            </Link>
          )
        })}
        {runs.length === 0 && (
          <p className="text-gray-400 italic text-sm">No runs found.</p>
        )}
      </div>
    </div>
  )
}
