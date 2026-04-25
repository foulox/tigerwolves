import { redirect } from 'next/navigation'

export default async function MyWeekPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week } = await searchParams
  redirect(week ? `/plan?week=${week}` : '/plan')
}
