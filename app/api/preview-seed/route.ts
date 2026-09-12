import { NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { ensureRun, ensureLeaderLink, isSeedAllowed } from '@/lib/seedFixtures'

// Preview test-leader links (#327). Emails are not secret (they're all over the
// repo docs); their Clerk IDs are resolved at seed time via the deployment's own
// Clerk instance, so nothing environment-specific is committed. This is the whole
// input surface — there is no request body, so the endpoint can never link an
// arbitrary account, only these two known ones.
const PREVIEW_LEADERS: { email: string; runId: string; runName: string }[] = [
  { email: 'foulox@gmail.com', runId: 'tigerwolves', runName: 'TigerWolves' },
  { email: 'foulox+mmer@gmail.com', runId: 'mmer', runName: 'MMER' },
]

// POST /api/preview-seed — idempotently ensures the test runs exist and the two
// known test leaders are linked, on a Preview/Development deployment's own DB.
// Hard-off in production. Public in proxy.ts so both the in-app "Set up this
// preview" button (authenticated) and the CI auto-seed (unauthenticated) can
// reach it; the VERCEL_ENV guard is what actually protects it.
export async function POST() {
  if (!isSeedAllowed(process.env.VERCEL_ENV)) {
    return NextResponse.json({ error: 'not available in production' }, { status: 403 })
  }

  // Ensure both runs exist. tigerwolves is normally already present on the branch
  // (DO NOTHING keeps its real config); mmer is created blank for the
  // "configure a new run" flow.
  for (const { runId, runName } of PREVIEW_LEADERS) {
    await ensureRun({ id: runId, name: runName })
  }

  const client = await clerkClient()
  const results: { email: string; runId: string; linked: boolean; note?: string }[] = []
  for (const { email, runId } of PREVIEW_LEADERS) {
    const { data } = await client.users.getUserList({ emailAddress: [email] })
    const found = data[0]
    if (!found) {
      results.push({ email, runId, linked: false, note: 'no Clerk user for this email on this instance' })
      continue
    }
    const created = await ensureLeaderLink({ runId, clerkUserId: found.id, name: email })
    results.push({ email, runId, linked: true, note: created ? 'link created' : 'already linked' })
  }

  // Fixture rows are written with raw SQL, bypassing the app's mutation paths —
  // invalidate the read cache the same way a Server Action write would (see the
  // e2e-revalidate route + CLAUDE.md's cache-invalidation guardrail).
  revalidatePath('/', 'layout')
  revalidateTag('tigerwolves-data', 'max')

  return NextResponse.json({ ok: true, results })
}
