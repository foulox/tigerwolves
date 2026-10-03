// #465 Story B — pure request classification for the service worker.
// Kept dependency-free and pure so the scope guard is fully unit-testable.

export type CacheStrategy = 'cache-first' | 'stale-while-revalidate' | 'network-only'

/** Exact public, read-only routes cached stale-while-revalidate. */
export const SWR_ROUTES = ['/all-runs', '/library', '/races'] as const

/** Dynamic route prefix cached per-slug, stale-while-revalidate. */
const RUNS_SLUG_PREFIX = '/runs/'

/** Path prefixes that must NEVER be cached (auth, writes, api). */
export const NETWORK_ONLY_PREFIXES = ['/schedule', '/my-plan', '/api'] as const

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + '/')
}

export function classifyRoute(pathname: string): CacheStrategy {
  // Network-only wins first — the scope guard is a denylist that outranks caching.
  if (NETWORK_ONLY_PREFIXES.some((p) => matchesPrefix(pathname, p))) {
    return 'network-only'
  }
  if ((SWR_ROUTES as readonly string[]).includes(pathname)) {
    return 'stale-while-revalidate'
  }
  // A run slug (/runs/<slug>) is cached; the bare /runs index is not.
  if (pathname.startsWith(RUNS_SLUG_PREFIX) && pathname.length > RUNS_SLUG_PREFIX.length) {
    return 'stale-while-revalidate'
  }
  // Default: do not cache unknown routes (home, sign-in, etc.).
  return 'network-only'
}
