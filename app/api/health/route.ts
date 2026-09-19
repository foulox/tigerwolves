import { NextResponse } from 'next/server'
import { resolveDbUrl, extractHost } from '@/lib/dbHost'

// Diagnostic: surface which database HOST this deployment is actually reading,
// so the demo's data source is observable and CI can assert it (#415). The demo
// drift incident (#376/#404) was invisible precisely because nothing exposed the
// connected branch — the demo silently served stale/wrong data. Host only, never
// the connection secret (extractHost strips credentials). Uses the same
// DEMO_DATABASE_URL || DATABASE_URL precedence as lib/db.ts, so the reported host
// is the branch the app truly queries. Read-only, no auth needed — a hostname is
// not sensitive without its user/password.
//
// Force dynamic so the host reflects this deployment's live env, never a value
// baked at build time.
export const dynamic = 'force-dynamic'

export async function GET() {
  const host = extractHost(resolveDbUrl())
  return NextResponse.json({ dbHost: host, ok: host !== null })
}
