import type { VoteData } from './votes'

export const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

export function demoVoteData(workoutId: string): VoteData {
  let hash = 0
  for (const char of workoutId) {
    hash = (hash * 31 + char.charCodeAt(0)) & 0xffff
  }
  return {
    avg: (hash % 3) + 3,    // 3, 4, or 5 — workouts are good!
    count: (hash % 15) + 5, // 5–19 votes
  }
}
