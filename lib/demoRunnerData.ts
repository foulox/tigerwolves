// Hardcoded data for the #302 runner prototype — Sep 12 leaders' meeting demo.
// Persona: Caitlin Manly, Mourning Doves leader who also runs TigerWolves, MMER, Narwhals.
// Hardcoded to Tuesday Sep 8, ~10am — TigerWolves already ran this morning.

export type RunId = 'tigerwolves' | 'doves' | 'mmer' | 'narwhals' | 'hellkatz'

export type RunSeries = {
  id: RunId
  name: string
  fullName: string
  day: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
  dayName: string
  time: string
  place: string
  // left-side bar + border accent for this run's card
  bar: string       // Tailwind bg class
  border: string    // Tailwind border class
  tintBg: string    // Tailwind bg class for expanded header
  // pill on run cards
  pillBg: string    // Tailwind bg class
  pillText: string  // Tailwind text class
  pillLabel: string
  blurb: string
  leaders: string
  distance: string
}

export type WeekContent = {
  title: string
  prose?: string
  lines?: [string, string][]
  tags?: string[]
  cta?: string
  image?: boolean
}

// Run color system — matches design file's SERIES config
export const SERIES: Record<RunId, RunSeries> = {
  tigerwolves: {
    id: 'tigerwolves',
    name: 'TigerWolves',
    fullName: 'Tuesday Morning Tigerwolves',
    day: 'tue',
    dayName: 'TUESDAY',
    time: '6:30am',
    place: 'McCarren Park',
    bar: 'bg-orange-500',
    border: 'border-orange-200',
    tintBg: 'bg-orange-50',
    pillBg: 'bg-blue-100',
    pillText: 'text-blue-800',
    pillLabel: 'Quality',
    blurb: 'The Tuesday morning quality session. One workout a week, posted by whoever is leading.',
    leaders: 'Led by Lou and 7 others',
    distance: '~6 mi',
  },
  doves: {
    id: 'doves',
    name: 'Mourning Doves',
    fullName: 'Wednesday Mourning Doves',
    day: 'wed',
    dayName: 'WEDNESDAY',
    time: '6:00am',
    place: 'Tom Stofka Garden',
    bar: 'bg-purple-500',
    border: 'border-purple-200',
    tintBg: 'bg-purple-50',
    pillBg: 'bg-purple-100',
    pillText: 'text-purple-800',
    pillLabel: 'Long Runs',
    blurb: 'A medium-long Wednesday route, posted each week in the leader\'s own words.',
    leaders: 'Led by you, Brent, Erin and Evan',
    distance: '~8 mi',
  },
  mmer: {
    id: 'mmer',
    name: 'MMER',
    fullName: 'Monday Morning Easy Run',
    day: 'mon',
    dayName: 'MONDAY',
    time: '6:45am',
    place: 'McCarren Park',
    bar: 'bg-green-500',
    border: 'border-gray-200',
    tintBg: 'bg-gray-50',
    pillBg: 'bg-green-100',
    pillText: 'text-green-800',
    pillLabel: 'Easy',
    blurb: 'Conversational miles to start the week. No workout — a leader runs at the back so nobody gets dropped.',
    leaders: 'Led by a rotating leader',
    distance: '3–4 mi',
  },
  narwhals: {
    id: 'narwhals',
    name: 'Narwhals',
    fullName: 'Saturday Narwhals',
    day: 'sat',
    dayName: 'SATURDAY',
    time: '7:00am',
    place: 'McCarren Park',
    bar: 'bg-green-500',
    border: 'border-green-200',
    tintBg: 'bg-green-50',
    pillBg: 'bg-purple-100',
    pillText: 'text-purple-800',
    pillLabel: 'Long Runs',
    blurb: 'The Saturday long run, with pace groups for every distance from 10 to 22 miles.',
    leaders: 'Led by Sam and 4 others',
    distance: '10–22 mi',
  },
  hellkatz: {
    id: 'hellkatz',
    name: 'Hellkatz',
    fullName: 'Thursday Morning Hellkatz',
    day: 'thu',
    dayName: 'THURSDAY',
    time: '6:45am',
    place: 'McCarren Track',
    bar: 'bg-sky-500',
    border: 'border-sky-200',
    tintBg: 'bg-sky-50',
    pillBg: 'bg-blue-100',
    pillText: 'text-blue-800',
    pillLabel: 'Workouts',
    blurb: 'Thursday track session — reps on the McCarren track, all paces welcome.',
    leaders: 'Led by Ali and 3 others',
    distance: '3–5 mi',
  },
}

// Runs the demo persona is joined to by default
export const DEFAULT_JOINED: RunId[] = ['tigerwolves', 'doves', 'mmer', 'narwhals']

// localStorage key for join state
export const RUNNER_JOINED_KEY = 'tw_runner_joined'

// Day order for sorting
export const DAY_ORDER: RunSeries['day'][] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
export const DAY_LABEL: Record<RunSeries['day'], string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday',
  thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
}

// Hardcoded week — Sep 7–13, today = Tuesday Sep 8 (demo state: ~10am, TigerWolves done)
export const DEMO_WEEK = {
  range: 'Sep 7–13',
  today: 'tue' as const,
  dates: { mon: '7', tue: '8', wed: '9', thu: '10', fri: '11', sat: '12', sun: '13' } as Record<RunSeries['day'], string>,
  // Runs that have already happened this week (before the demo state)
  pastToday: ['mon', 'tue'] as RunSeries['day'][],
}

// Per-series week content (this week = index 0, current demo state)
export const WEEK_CONTENT: Record<RunId, WeekContent> = {
  tigerwolves: {
    title: 'Broken Tempo',
    lines: [
      ['Instructions: ', '3×1mi @ tempo, 2 min standing rest'],
      ['Coach Notes: ', 'Hold the last rep — don\'t bank time on rep one.'],
    ],
    tags: ['Build', 'Threshold', '~6 mi', 'RPE 7'],
  },
  doves: {
    title: 'Socrates Sculpture Park',
    prose: 'Hey Doves! Join us for a little jaunt to Socrates Sculpture park this week, where it\'s always closed but we never care. On the roughly 8 mile out and back, feel free to get philosophical with your fellow birds. Or we can just talk about our favorite snacks. We\'ll see where the morning takes us!',
    tags: ['Out and back', '~8 mi', 'Easy effort'],
    image: true,
  },
  mmer: {
    title: 'Monday Morning Easy Run',
    prose: '3–4 miles at conversational pace. No workout — a leader runs at the back so nobody gets dropped.',
    tags: ['3–4 mi', 'Easy'],
  },
  narwhals: {
    title: 'Saturday long run',
    prose: 'Groups for every distance from 10 to 22 miles. Nobody posts a route until Friday night.',
    tags: ['10–22 mi', 'Pace groups'],
  },
  hellkatz: {
    title: 'This week\'s session',
    prose: 'Hellkatz haven\'t posted Thursday\'s session yet. It\'ll appear here as soon as their leaders do.',
    tags: ['3–5 mi', 'Track'],
  },
}

// Mourning Doves upcoming schedule for the run page
export type DovesRoute = {
  date: string          // display date
  dateShort: string     // e.g. "Sep 9"
  isNext: boolean
  title: string
  leader: string
  distance: string
  type: string
  prose: string
  stravaUrl?: string
}

export const DOVES_ROUTES: DovesRoute[] = [
  {
    date: 'Wednesday, Sep 9',
    dateShort: 'Sep 9',
    isNext: true,
    title: 'Socrates Sculpture Park',
    leader: 'Caitlin Manly',
    distance: '~8 mi',
    type: 'Out and back',
    prose: 'Hey Doves! Join us for a little jaunt to Socrates Sculpture park this week, where it\'s always closed but we never care. On the roughly 8 mile out and back, feel free to get philosophical with your fellow birds. Or we can just talk about our favorite snacks. We\'ll see where the morning takes us!',
    stravaUrl: 'https://www.strava.com/routes/7470772',
  },
  {
    date: 'Wednesday, Sep 16',
    dateShort: 'Sep 16',
    isNext: false,
    title: 'Eastbound & Down',
    leader: 'Brent Adams',
    distance: '~9 mi',
    type: 'Loop',
    prose: 'Hello beloved Mourning Doves! This Wednesday we\'ll be running Eastbound & Down — a lovely 9-ish mile loop out to Highland Park, hugging the hem where Bushwick borders Ridgewood. Some nice early morning, long hilly stretches for those of you working toward this year\'s marathon.',
    stravaUrl: 'https://www.strava.com/routes/3324355930994658434',
  },
  {
    date: 'Wednesday, Sep 23',
    dateShort: 'Sep 23',
    isNext: false,
    title: 'Beach Day',
    leader: 'Caitlin Manly',
    distance: 'TBD',
    type: 'Out and back',
    prose: 'Details coming soon — save the date!',
  },
]
