-- Story #365 (migrate-446.sql — numbered above #445's rename so it applies AFTER it).
-- All Runs renders from the runs table (unified model). Idempotent / replay-safe:
-- ADD ... IF NOT EXISTS; seed guarded by WHERE NOT EXISTS on id; DROP ... IF EXISTS.
-- Run against Preview + test-data during the build; production + demo at/after merge.
-- PRECONDITION: #445 has normalized every run id to slugify(name).

-- 1. New column for the directory distance label (e.g. "4–7 mi").
ALTER TABLE runs ADD COLUMN IF NOT EXISTS distance TEXT;

-- 2. Seed the 24 NBR directory entries as `unclaimed` catalog rows, keyed on
--    id = slugify(name). Any entry already a run (same id, post-#445) is skipped,
--    so tigerwolves/Doves/MMER-fixture keep their real status, leaders, schedules.
INSERT INTO runs (id, name, day_of_week, meeting_time, meeting_location, kind, distance, status)
SELECT v.id, v.name, v.day_of_week, v.meeting_time, v.meeting_location, v.kind, v.distance, 'unclaimed'
FROM (VALUES
  ('monday-morning-easy-run',    'Monday Morning Easy Run',       'Monday',    '6:45am', 'McCarren Park',        'Beginner-Friendly', '3–4 mi'),
  ('monday-night-plyo',          'Monday Night Plyo',             'Monday',    '6:30pm', 'McCarren Park',        'Workout',           'Strength & Cross-Training'),
  ('monday-night-easy-run',      'Monday Night Easy Run',         'Monday',    '7:30pm', 'McCarren Park',        'Beginner-Friendly', '3–4 mi'),
  ('monday-nite-owls',           'Monday Nite Owls',              'Monday',    '9:10pm', 'McCarren Park',        'Long',              '9–10 mi'),
  ('tuesday-morning-tigerwolves','Tuesday Morning Tigerwolves',   'Tuesday',   '6:30am', 'McCarren Park',        'Workout',           '4–7 mi'),
  ('tuesday-bushwick-run',       'Tuesday Bushwick Run',          'Tuesday',   '7:00am', 'Maria Hernandez Park', 'Easy',              '4–6 mi'),
  ('tuesday-lc-tempo',           'Tuesday LC Tempo',              'Tuesday',   '7:00pm', 'Grand Army Plaza',     'Workout',           '4–8 mi'),
  ('tuesday-night-tempo-tnt',    'Tuesday Night Tempo (TNT)',     'Tuesday',   '7:30pm', 'McCarren Park',        'Workout',           '4–7 mi'),
  ('wednesday-mourning-doves',   'Wednesday Mourning Doves',      'Wednesday', '6:00am', 'Tom Stofka Garden',    'Long',              '7–11 mi'),
  ('wednesday-night-beginner-run','Wednesday Night Beginner Run', 'Wednesday', '7:00pm', 'McCarren Park',        'Beginner-Friendly', '2–3 mi'),
  ('wednesday-night-road-run',   'Wednesday Night Road Run',      'Wednesday', '7:30pm', 'McCarren Park',        'Easy',              '4–6 mi'),
  ('wednesday-night-form-run',   'Wednesday Night Form Run',      'Wednesday', '7:30pm', 'Grand Army Plaza',     'Easy',              '3–4 mi'),
  ('thursday-just-south-tempo',  'Thursday ''Just South'' Tempo', 'Thursday',  '6:30am', 'Grand Army Plaza',     'Workout',           '3–5 mi'),
  ('thursday-morning-hellkatz',  'Thursday Morning Hellkatz',     'Thursday',  '6:45am', 'McCarren Track',       'Workout',           '3–5 mi'),
  ('thursday-night-track',       'Thursday Night Track',          'Thursday',  '7:30pm', 'McCarren Track',       'Workout',           '3–5 mi'),
  ('first-friday-salmon-run',    'First Friday Salmon Run',       'Friday',    '7:30am', 'McCarren Park',        'Food',              '1.6 mi'),
  ('second-friday-donut-run',    'Second Friday Donut Run',       'Friday',    '7:30am', 'McCarren & Prospect',  'Food',              '3–4 mi'),
  ('fourth-friday-bagel-run',    'Fourth Friday Bagel Run',       'Friday',    '7:30am', 'McCarren Park',        'Food',              '3 mi'),
  ('third-friday-ice-cream-run', 'Third Friday Ice Cream Run',    'Friday',    '6:00pm', 'McCarren Park',        'Food',              '2–3 mi'),
  ('second-friday-brewery-run',  'Second Friday Brewery Run',     'Friday',    '6:30pm', 'McCarren',             'Food',              '2–4 mi'),
  ('saturday-narwhals',          'Saturday Narwhals',             'Saturday',  '7:00am', 'McCarren Park',        'Long',              '10–22 mi'),
  ('saturday-lc-long-run',       'Saturday LC Long Run',          'Saturday',  '7:15am', 'BP Station',           'Long',              '10–22 mi'),
  ('saturday-bridge-coffee-run', 'Saturday Bridge & Coffee Run',  'Saturday',  '9:00am', 'Williamsburg Bridge',  'Beginner-Friendly', '3–4 mi'),
  ('sunday-funday',              'Sunday Funday',                 'Sunday',    '8:30am', 'McCarren Park',        'Long',              '10–22 mi')
) AS v(id, name, day_of_week, meeting_time, meeting_location, kind, distance)
WHERE NOT EXISTS (SELECT 1 FROM runs r WHERE r.id = v.id);

-- 3. Drop the now-redundant directory link. Safe because #365's code (Tasks 4–8)
--    removes every reader of nbr_directory_id, and the seed above keys on id.
DROP INDEX IF EXISTS runs_nbr_directory_id_key;
ALTER TABLE runs DROP COLUMN IF EXISTS nbr_directory_id;
