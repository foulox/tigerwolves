export type NBRRun = {
  id: string
  name: string
  day: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
  startTime: string   // display string e.g. "6:30am"
  startHour: number   // 24h float for sort/filter e.g. 6.5 = 6:30am
  location: string
  distance: string    // display string e.g. "4–7 mi" or "Strength & Cross-Training"
  category: 'Beginner-Friendly' | 'Easy Runs' | 'Long Runs' | 'Food Runs' | 'Workouts'
}
