export type WorkoutType =
  | 'Hills'
  | 'Broken Tempo'
  | 'Progression'
  | 'Ladder'
  | 'Superset'
  | 'Straight Tempo'
  | 'Threshold'

export type Workout = {
  id: string
  name: string
  type: WorkoutType
  description: string
  lastUsed: string | null
  idealDistance: string
}

export type ScheduleEntry = {
  date: string
  weekOfMonth: number
  workoutType: WorkoutType
  leader: string
  workoutId: string | null
  workoutName: string | null
}

export type Race = {
  date: string
  name: string
  distance: string
  location: string
}

export const CURRENT_LEADER = 'Lou'

export const WORKOUTS: Workout[] = [
  { id: 'w1', name: 'Repeat Hills', type: 'Hills', description: '8x hill repeats. 90 sec rest between reps. Focus on driving knees on the way up, controlled on the way down.', lastUsed: '2026-02-18', idealDistance: '5–6 miles' },
  { id: 'w2', name: 'Death by Hills', type: 'Hills', description: 'Progressive sets: 6, 7, 8, 9, 10 reps with 2 min rest between sets. Get after it.', lastUsed: '2026-01-07', idealDistance: '6–7 miles' },
  { id: 'w3', name: 'Hill Circuit', type: 'Hills', description: '3 sets of (2x short hill + 1x long hill). 90 sec rest within sets, 3 min between sets.', lastUsed: '2025-12-03', idealDistance: '5 miles' },
  { id: 'w4', name: '4×10 Broken Tempo', type: 'Broken Tempo', description: '4 × 10 min at tempo pace with 2 min recovery jog between each.', lastUsed: '2026-03-10', idealDistance: '7–8 miles' },
  { id: 'w5', name: '3×15 Broken Tempo', type: 'Broken Tempo', description: '3 × 15 min at threshold effort with 3 min float recovery.', lastUsed: '2026-01-20', idealDistance: '8 miles' },
  { id: 'w6', name: '6 Mile Progression', type: 'Progression', description: 'Start 45 sec/mile slower than goal race pace. Negative split to goal pace by the finish.', lastUsed: '2026-03-17', idealDistance: '6 miles' },
  { id: 'w7', name: '8 Mile Progression', type: 'Progression', description: 'Easy first 3, steady miles 4–6, strong finish miles 7–8. Each mile a touch faster.', lastUsed: '2026-02-03', idealDistance: '8 miles' },
  { id: 'w8', name: 'Classic Ladder', type: 'Ladder', description: '400–800–1200–1600–1200–800–400. Equal rest after each rep. Strong through the back half.', lastUsed: '2026-03-24', idealDistance: '7 miles' },
  { id: 'w9', name: 'Down Ladder', type: 'Ladder', description: '1600–1200–1000–800–600–400. Each rep a bit faster than the last. Finish strong.', lastUsed: '2026-01-27', idealDistance: '6 miles' },
  { id: 'w10', name: '3×(800+400)', type: 'Superset', description: '3 supersets: 800 at 5K pace, 90 sec rest, 400 at mile pace, 3 min rest between supersets.', lastUsed: '2026-02-24', idealDistance: '6 miles' },
  { id: 'w11', name: '40 Min Tempo', type: 'Straight Tempo', description: 'Continuous 40 minutes at comfortably hard (tempo) pace. No stopping, no fading.', lastUsed: '2026-03-31', idealDistance: '7 miles' },
  { id: 'w12', name: '3×12 Threshold', type: 'Threshold', description: '3 × 12 min at lactate threshold with 3 min easy jog recovery between each.', lastUsed: '2026-02-10', idealDistance: '7–8 miles' },
]

export const SCHEDULE: ScheduleEntry[] = [
  { date: '2026-04-28', weekOfMonth: 4, workoutType: 'Ladder', leader: 'Lou', workoutId: 'w8', workoutName: 'Classic Ladder' },
  { date: '2026-05-05', weekOfMonth: 1, workoutType: 'Hills', leader: 'Kostas', workoutId: 'w1', workoutName: 'Repeat Hills' },
  { date: '2026-05-12', weekOfMonth: 2, workoutType: 'Broken Tempo', leader: 'Matthew', workoutId: null, workoutName: null },
  { date: '2026-05-19', weekOfMonth: 3, workoutType: 'Progression', leader: 'Joelle', workoutId: null, workoutName: null },
  { date: '2026-05-26', weekOfMonth: 4, workoutType: 'Ladder', leader: 'Kelsey', workoutId: null, workoutName: null },
  { date: '2026-06-02', weekOfMonth: 1, workoutType: 'Hills', leader: 'Obi', workoutId: null, workoutName: null },
  { date: '2026-06-09', weekOfMonth: 2, workoutType: 'Broken Tempo', leader: 'Jared', workoutId: null, workoutName: null },
  { date: '2026-06-16', weekOfMonth: 3, workoutType: 'Progression', leader: 'Luis', workoutId: null, workoutName: null },
  { date: '2026-06-23', weekOfMonth: 4, workoutType: 'Superset', leader: 'Lou', workoutId: null, workoutName: null },
]

export const RACES: Race[] = [
  { date: '2026-05-17', name: 'Brooklyn Half Marathon', distance: 'Half Marathon', location: 'Brooklyn, NY' },
  { date: '2026-06-06', name: 'Queens 10K', distance: '10K', location: 'Queens, NY' },
  { date: '2026-09-07', name: 'NYC 18-Miler', distance: '18 miles', location: 'Central Park, NY' },
  { date: '2026-11-01', name: 'TCS NYC Marathon', distance: 'Marathon', location: 'New York, NY' },
]
