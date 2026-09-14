import { requireAdminPage } from '@/lib/requireAdminPage'
import Header from '@/components/Header'
import CreateRunForm from '@/components/CreateRunForm'

export default async function CreateRunPage() {
  await requireAdminPage()

  return (
    <div>
      <Header title="Create a run" isLeader={false} />
      <div className="px-4 pb-24 flex flex-col gap-3">
        <CreateRunForm />
      </div>
    </div>
  )
}
