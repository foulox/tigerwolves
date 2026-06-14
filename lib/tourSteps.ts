import type { DriveStep } from 'driver.js'

export const VISITOR_STEPS: DriveStep[] = [
  {
    element: '[data-tour="schedule"]',
    popover: {
      title: 'Schedule',
      description: 'See upcoming Tuesday workouts — what type of run is planned, who\'s leading, and the chosen workout for each week.',
      side: 'bottom',
      align: 'start',
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
    element: '[data-tour="races"]',
    popover: {
      title: 'Races',
      description: 'Track upcoming races. Workouts in the library are tagged by race distance so you can train specifically for what\'s coming up.',
      side: 'top',
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
      description: 'Once you pick a workout, a Heylo post draft is generated automatically. Tap "Copy to clipboard" and paste it directly into Heylo.',
      side: 'top',
      align: 'start',
    },
  },
]
