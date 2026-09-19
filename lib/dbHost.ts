// Observability helpers for "which database is this deployment actually reading?"
// (#415). The demo drift incident (#376/#404) was invisible because nothing
// surfaced the demo deployment's real data source — it silently served stale
// data. These pure helpers back /api/health so the connected host is observable
// and CI can assert the demo is reading demo-data.

/**
 * Resolve the connection string this deployment reads, using the SAME precedence
 * as lib/db.ts: DEMO_DATABASE_URL (set only on the demo/staging deploy, points at
 * the durable demo-data branch) wins over DATABASE_URL. Kept in lockstep with
 * lib/db.ts's `const dbUrl = process.env.DEMO_DATABASE_URL || process.env.DATABASE_URL`.
 */
export function resolveDbUrl(
  env: Record<string, string | undefined> = process.env
): string | undefined {
  return env.DEMO_DATABASE_URL || env.DATABASE_URL
}

/**
 * Extract the hostname from a Postgres connection string — host only, never the
 * credentials. Returns null for a missing or unparseable url. Safe to expose:
 * a Neon host is not a secret without the accompanying user/password.
 */
export function extractHost(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}
