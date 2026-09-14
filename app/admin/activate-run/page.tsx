import { requireAdminPage } from '@/lib/requireAdminPage'
import Header from '@/components/Header'
import ActivateRunForm from '@/components/ActivateRunForm'
import { getActivatedNbrDirectoryIds } from '@/lib/db'
import { NBR_RUNS } from '@/lib/allRunsData'

export default async function ActivateRunPage() {
  await requireAdminPage()

  const activated = new Set(await getActivatedNbrDirectoryIds())
  const available = NBR_RUNS.filter(r => !activated.has(r.id))

  return (
    <div>
      <Header title="Activate an NBR Run" isLeader={false} />
      <div className="px-4 pb-24 flex flex-col gap-3">
        <ActivateRunForm runs={available} />
      </div>
    </div>
  )
}
