import type { DriveStep } from 'driver.js'

export const VISITOR_STEPS: DriveStep[] = [
  {
    element: '[data-tour="schedule"]',
    popover: {
      title: 'Schedule',
      description: 'See upcoming workouts — what type of run is planned, who\'s leading, and the chosen workout for each week.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="schedule-detail"]',
    popover: {
      title: 'Tap any card to expand',
      description: 'Tap a workout card to see the full details ��� instructions, lap structure, HR zone, training phases, and more.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="schedule-reactions"]',
    popover: {
      title: 'React to a workout',
      description: 'Tell us how you feel about this workout — tap an emoji to vote. You\'ll see how the group feels too.',
      side: 'top',
      align: 'end',
    },
  },
  {
    element: '[data-tour="library"]',
    popover: {
      title: 'Workout Library',
      description: 'Browse the full workout catalog. Filter by category (Quality, Long, Easy), type, or race distance. Search by name or keyword.',
      side: 'top',
      align: 'start',
    },
  },
  {
    element: '[data-tour="library-variations"]',
    popover: {
      title: 'Workout variations',
      description: 'Some workouts have multiple versions that build on each other. Tap a family card to browse all progressions.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="races"]',
    popover: {
      title: 'Races',
      description: 'Track upcoming races. Workouts in the library are tagged by race distance so you can train specifically for what\'s coming up.',
      side: 'top',
      align: 'start',
    },
  },
  {
    element: '[data-tour="feedback"]',
    popover: {
      title: 'Report a workout issue',
      description: 'Something wrong with a workout? Tap here to report it — bad distance, unclear instructions, anything off. We read every one.',
      side: 'top',
      align: 'end',
    },
  },
  {
    element: '[data-tour="how-to-use"]',
    popover: {
      title: 'Relaunch this tour anytime',
      description: 'You can replay this tour whenever you want using the "How to use this" link.',
      side: 'bottom',
      align: 'start',
    },
  },
]

export const LEADER_STEPS: DriveStep[] = [
  {
    element: '[data-tour="plan"]',
    popover: {
      title: 'Plan',
      description: 'Pick a workout for the week from the library. The picker shows least-recently-used workouts first so you don\'t repeat yourself.',
      side: 'top',
      align: 'start',
    },
  },
  {
    element: '[data-tour="heylo-copy"]',
    popover: {
      title: 'Heylo Post',
      description: 'Once you pick a workout, a Heylo post draft is generated automatically. Tap "Copy to clipboard" and paste it directly into Heylo. ⚠️ Before you copy, double-check the turnaround distance — it may not be accurate yet. A fix is on the way.',
      side: 'top',
      align: 'start',
    },
  },
  {
    element: '[data-tour="library-manage"]',
    popover: {
      title: 'Manage the library',
      description: 'Use the edit button (✎) to fix a workout, the delete button to remove it, or the regroup tool in Settings (⚙) to combine related workouts into a family with numbered variations.',
      side: 'bottom',
      align: 'end',
    },
  },
]
