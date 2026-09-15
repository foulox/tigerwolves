/**
 * Determines whether to show the "All Runs" intro box to the user.
 * Show for anonymous users (not logged in) or signed-in users with no followed runs.
 * Hide for signed-in users who are already following at least one run.
 *
 * Three audiences:
 * - Anonymous (isLoggedIn=false) → show intro
 * - Signed-in, 0 follows (followCount=0) → show intro
 * - Signed-in, ≥1 follow (followCount≥1) → hide intro
 */
export function shouldShowIntro(isLoggedIn: boolean, followCount: number): boolean {
  return !isLoggedIn || followCount === 0
}
