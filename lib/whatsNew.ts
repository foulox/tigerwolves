export const CURRENT_VERSION = 2

export const WHATS_NEW: { version: number; title: string; description: string }[] = [
  { version: 1, title: 'Sign in as a leader', description: 'Leaders can now sign in with Clerk to access write features. Visitors still browse freely.' },
  { version: 1, title: 'Public read-only view', description: 'Visitors see the full schedule, library, and races — add/edit controls only appear when signed in.' },
  { version: 1, title: 'Leader identity badge', description: 'Signed-in leaders see an avatar badge in the top-right corner with a sign-out option.' },
  { version: 1, title: 'Expandable workout cards', description: 'Tap "Show details" on any card in the plan picker to see full instructions, lap structure, HR zone, and more.' },
  { version: 1, title: 'Onboarding tour', description: 'New visitors get a guided tour on first visit. Re-launch anytime with the "How to use this" button.' },
  { version: 2, title: 'Emoji reactions', description: 'React to workouts on the Schedule and in the Library — tap an emoji to vote and see how the group feels.' },
  { version: 2, title: 'Expandable workout details on Schedule', description: 'Tap any Schedule card to see the full workout — instructions, lap structure, HR zone, and more.' },
  { version: 2, title: 'Workout variations in the Library', description: 'Some workouts have multiple versions. Tap a family card in the Library to browse all progressions.' },
  { version: 2, title: 'Feedback button', description: 'Tap the feedback button anytime to report a workout issue or request a feature.' },
  { version: 2, title: 'Library management', description: 'As a leader: use the edit button to fix a workout, delete to remove it, or the regroup tool in Settings to build workout families.' },
  { version: 2, title: 'Roadmap', description: 'See where TigerWolves is headed — what\'s live now, what\'s coming next, and what\'s on the horizon.' },
  { version: 2, title: 'Tour updated', description: 'New tour steps for reactions, workout details, variations, roadmap, feedback, and leader library tools. Relaunch anytime with "How to use this".' },
]
