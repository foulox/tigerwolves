import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getLeaderRun, getRunRoster } from '@/lib/db'
import RunConfigClient from '@/components/RunConfigClient'

export default async function RunConfigPage() {
  const user = await currentUser()
  if (!user) redirect('/sign-in')
  console.log('[dbg run-config] server currentUser.id=', user.id, 'role=', user.publicMetadata?.role)
  if (user.publicMetadata?.role !== 'leader') redirect('/')

  const runConfig = await getLeaderRun(user.id)
  console.log('[dbg run-config] getLeaderRun(', user.id, ') =>', JSON.stringify(runConfig))
  if (!runConfig) redirect('/')

  const runLeaders = await getRunRoster(runConfig.id)
  return <RunConfigClient runConfig={runConfig} runLeaders={runLeaders} currentUserId={user.id} />
}
