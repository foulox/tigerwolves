import { currentUser } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { generateNarrative } from '@/lib/routeDirections'

export async function POST(req: Request) {
  const user = await currentUser()
  if (!user || user.publicMetadata?.role !== 'leader') return new Response('Unauthorized', { status: 401 })

  try {
    const { url, name, distanceMiles } = (await req.json()) as { url?: string; name?: string | null; distanceMiles?: number | null }
    if (!url || !url.trim()) return NextResponse.json({ narrative: null })
    const narrative = await generateNarrative({ url, routeName: name ?? null, distanceMiles: distanceMiles ?? null })
    return NextResponse.json({ narrative: narrative ?? null })
  } catch (err) {
    Sentry.captureException(err)
    return NextResponse.json({ narrative: null })
  }
}
