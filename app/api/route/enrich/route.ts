import { currentUser } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { providerFor } from '@/lib/routeProviders/registry'

export async function POST(req: Request) {
  const user = await currentUser()
  if (!user || user.publicMetadata?.role !== 'leader') return new Response('Unauthorized', { status: 401 })

  try {
    const { url } = (await req.json()) as { url?: string }
    const provider = url ? providerFor(url) : null
    if (!provider) return NextResponse.json({ enriched: false })

    const result = await provider.fetch(url!)
    if (!result) return NextResponse.json({ enriched: false })

    return NextResponse.json({
      enriched: true,
      provider: provider.id,
      distanceMiles: result.distanceMiles,
      elevationFeet: result.elevationFeet,
      geometry: result.geometry,
      name: result.name,
      imageUrl: result.imageUrl,
    })
  } catch (err) {
    Sentry.captureException(err)
    return NextResponse.json({ enriched: false })
  }
}
