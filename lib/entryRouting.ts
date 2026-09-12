// #332 Home flip — the pure decision behind the `/` router. Kept dependency-free
// (no Clerk, no DB, no redirect) so app/page.tsx stays a thin shell over it and
// the routing rule unit-tests in isolation.
//
// Rule:
//   logged out                 → /all-runs   (public; the run picker / browse)
//   signed in, 0 follows        → /all-runs   (first-login picker prompt)
//   signed in, ≥1 follow        → /my-week    (the home)
export function entryTarget(isSignedIn: boolean, followCount: number): '/all-runs' | '/my-week' {
  if (!isSignedIn) return '/all-runs'
  return followCount > 0 ? '/my-week' : '/all-runs'
}
