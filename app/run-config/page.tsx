import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getLeaderRun, getRunRoster } from '@/lib/db'
import RunConfigClient from '@/components/RunConfigClient'
import RunConfigUnlinked from '@/components/RunConfigUnlinked'
import { runConfigGate } from '@/lib/runConfigGate'

export default async function RunConfigPage() {
  const user = await currentUser()
  const isLeader = user?.publicMetadata?.role === 'leader'
  // Only a signed-in leader can have a run to configure; skip the query otherwise.
  const runConfig = user && isLeader ? await getLeaderRun(user.id) : null

  // #327: split the old blanket `redirect('/')`. A leader with no linked run is a
  // data/environment problem, not an auth denial — surface it instead of silently
  // bouncing to Schedule (see runConfigGate for the decision table).
  const gate = runConfigGate({ isSignedIn: !!user, isLeader, hasRun: !!runConfig })
  if (gate === 'signin') redirect('/sign-in')
  if (gate === 'diagnostic') return <RunConfigUnlinked canSeed={process.env.VERCEL_ENV !== 'production'} />
  if (gate !== 'ok' || !user || !runConfig) redirect('/')

  const runLeaders = await getRunRoster(runConfig.id)
  return <RunConfigClient runConfig={runConfig} runLeaders={runLeaders} currentUserId={user.id} />
}
