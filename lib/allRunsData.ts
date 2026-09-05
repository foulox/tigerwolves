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

// Source: northbrooklynrunners.org/nbr-schedule (24 active runs; "Wednesday 'Just Central' Run" excluded — listed as No Longer Active)
export const NBR_RUNS: NBRRun[] = [
  // Monday
  { id: 'mon-morning-easy',  name: 'Monday Morning Easy Run',        day: 'mon', startTime: '6:45am', startHour: 6.75,  location: 'McCarren Park',        distance: '3–4 mi',                   category: 'Beginner-Friendly' },
  { id: 'mon-night-plyo',    name: 'Monday Night Plyo',              day: 'mon', startTime: '6:30pm', startHour: 18.5,  location: 'McCarren Park',        distance: 'Strength & Cross-Training', category: 'Workouts'          },
  { id: 'mon-night-easy',    name: 'Monday Night Easy Run',          day: 'mon', startTime: '7:30pm', startHour: 19.5,  location: 'McCarren Park',        distance: '3–4 mi',                   category: 'Beginner-Friendly' },
  { id: 'mon-nite-owls',     name: 'Monday Nite Owls',               day: 'mon', startTime: '9:10pm', startHour: 21.17, location: 'McCarren Park',        distance: '9–10 mi',                  category: 'Long Runs'         },

  // Tuesday
  { id: 'tue-tigerwolves',   name: 'Tuesday Morning Tigerwolves',    day: 'tue', startTime: '6:30am', startHour: 6.5,   location: 'McCarren Park',        distance: '4–7 mi',                   category: 'Workouts'          },
  { id: 'tue-bushwick',      name: 'Tuesday Bushwick Run',           day: 'tue', startTime: '7:00am', startHour: 7,     location: 'Maria Hernandez Park', distance: '4–6 mi',                   category: 'Easy Runs'         },
  { id: 'tue-lc-tempo',      name: 'Tuesday LC Tempo',               day: 'tue', startTime: '7:00pm', startHour: 19,    location: 'Grand Army Plaza',     distance: '4–8 mi',                   category: 'Workouts'          },
  { id: 'tue-tnt',           name: 'Tuesday Night Tempo (TNT)',      day: 'tue', startTime: '7:30pm', startHour: 19.5,  location: 'McCarren Park',        distance: '4–7 mi',                   category: 'Workouts'          },

  // Wednesday
  { id: 'wed-mourning-doves', name: 'Wednesday Mourning Doves',      day: 'wed', startTime: '6:00am', startHour: 6,     location: 'McCarren Park',        distance: '7–11 mi',                  category: 'Long Runs'         },
  { id: 'wed-night-beginner', name: 'Wednesday Night Beginner Run',  day: 'wed', startTime: '7:00pm', startHour: 19,    location: 'McCarren Park',        distance: '2–3 mi',                   category: 'Beginner-Friendly' },
  { id: 'wed-night-road',    name: 'Wednesday Night Road Run',       day: 'wed', startTime: '7:30pm', startHour: 19.5,  location: 'McCarren Park',        distance: '4–6 mi',                   category: 'Easy Runs'         },
  { id: 'wed-night-form',    name: 'Wednesday Night Form Run',       day: 'wed', startTime: '7:30pm', startHour: 19.5,  location: 'Grand Army Plaza',     distance: '3–4 mi',                   category: 'Easy Runs'         },

  // Thursday
  { id: 'thu-just-south',    name: "Thursday 'Just South' Tempo",   day: 'thu', startTime: '6:30am', startHour: 6.5,   location: 'Grand Army Plaza',     distance: '3–5 mi',                   category: 'Workouts'          },
  { id: 'thu-hellkatz',      name: 'Thursday Morning Hellkatz',      day: 'thu', startTime: '6:45am', startHour: 6.75,  location: 'McCarren Track',       distance: '3–5 mi',                   category: 'Workouts'          },
  { id: 'thu-night-track',   name: 'Thursday Night Track',           day: 'thu', startTime: '7:30pm', startHour: 19.5,  location: 'McCarren Track',       distance: '3–5 mi',                   category: 'Workouts'          },

  // Friday (monthly food runs — shown on Fridays in the weekly view)
  { id: 'fri-salmon',        name: 'First Friday Salmon Run',        day: 'fri', startTime: '7:30am', startHour: 7.5,   location: 'McCarren Park',        distance: '1.6 mi',                   category: 'Food Runs'         },
  { id: 'fri-donut',         name: 'Second Friday Donut Run',        day: 'fri', startTime: '7:30am', startHour: 7.5,   location: 'McCarren & Prospect',  distance: '3–4 mi',                   category: 'Food Runs'         },
  { id: 'fri-bagel',         name: 'Fourth Friday Bagel Run',        day: 'fri', startTime: '7:30am', startHour: 7.5,   location: 'McCarren Park',        distance: '3 mi',                     category: 'Food Runs'         },
  { id: 'fri-ice-cream',     name: 'Third Friday Ice Cream Run',     day: 'fri', startTime: '6:00pm', startHour: 18,    location: 'McCarren Park',        distance: '2–3 mi',                   category: 'Food Runs'         },
  { id: 'fri-brewery',       name: 'Second Friday Brewery Run',      day: 'fri', startTime: '6:30pm', startHour: 18.5,  location: 'McCarren',             distance: '2–4 mi',                   category: 'Food Runs'         },

  // Saturday
  { id: 'sat-narwhals',      name: 'Saturday Narwhals',              day: 'sat', startTime: '7:00am', startHour: 7,     location: 'McCarren Park',        distance: '10–22 mi',                 category: 'Long Runs'         },
  { id: 'sat-lc-long',       name: 'Saturday LC Long Run',           day: 'sat', startTime: '7:15am', startHour: 7.25,  location: 'BP Station',           distance: '10–22 mi',                 category: 'Long Runs'         },
  { id: 'sat-bridge-coffee', name: 'Saturday Bridge & Coffee Run',   day: 'sat', startTime: '9:00am', startHour: 9,     location: 'Williamsburg Bridge',  distance: '3–4 mi',                   category: 'Beginner-Friendly' },

  // Sunday
  { id: 'sun-funday',        name: 'Sunday Funday',                  day: 'sun', startTime: '8:30am', startHour: 8.5,   location: 'McCarren Park',        distance: '10–22 mi',                 category: 'Long Runs'         },
]
