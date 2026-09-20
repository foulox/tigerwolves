// Observability helpers for "which database is this deployment actually reading?"
// (#415). The demo drift incident (#376/#404) was invisible because nothing
// surfaced the demo deployment's real data source — it silently served stale
// data. These pure helpers back /api/health so the connected host is observable
// and CI can assert the demo is reading demo-data.

/**
 * Resolve the connection string this deployment reads. Every environment — prod,
 * demo (its own Vercel project), per-PR preview, and the test-data branch — reads
 * DATABASE_URL directly. Kept in lockstep with lib/db.ts's
 * `const dbUrl = process.env.DATABASE_URL`. (The old demo-only override was
 * retired in #429 once the demo became its own environment.)
 */
export function resolveDbUrl(
  env: Record<string, string | undefined> = process.env
): string | undefined {
  return env.DATABASE_URL
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
