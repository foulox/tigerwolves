export const CURRENT_VERSION = 1

export const WHATS_NEW: { version: number; title: string; description: string }[] = [
  { version: 1, title: 'Sign in as a leader', description: 'Leaders can now sign in with Clerk to access write features. Visitors still browse freely.' },
  { version: 1, title: 'Public read-only view', description: 'Visitors see the full schedule, library, and races — add/edit controls only appear when signed in.' },
  { version: 1, title: 'Leader identity badge', description: 'Signed-in leaders see an avatar badge in the top-right corner with a sign-out option.' },
  { version: 1, title: 'Expandable workout cards', description: 'Tap "Show details" on any card in the plan picker to see full instructions, lap structure, HR zone, and more.' },
  { version: 1, title: 'Onboarding tour', description: 'New visitors get a guided tour on first visit. Re-launch anytime with the "How to use this" button.' },
]
