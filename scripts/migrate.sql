-- Migration: initial schema
-- Run against production and staging (Neon preview branch) before #84 seed

CREATE TABLE IF NOT EXISTS workouts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  sport TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  dist_time TEXT NOT NULL DEFAULT '',
  lap_structure TEXT NOT NULL DEFAULT '',
  energy_system TEXT NOT NULL DEFAULT '',
  hr_zone TEXT NOT NULL DEFAULT '',
  rpe TEXT NOT NULL DEFAULT '',
  last_ran DATE,
  coaching_notes TEXT,
  map_link TEXT,
  variation TEXT NOT NULL DEFAULT '',
  progression INT,
  author TEXT,
  race_types TEXT[] NOT NULL DEFAULT '{}',
  training_phases TEXT[] NOT NULL DEFAULT '{}',
  has_turnaround BOOLEAN NOT NULL DEFAULT false,
  turnaround_distance TEXT NOT NULL DEFAULT '',
  UNIQUE (name, variation)
);

CREATE TABLE IF NOT EXISTS schedule (
  date DATE PRIMARY KEY,
  workout_type TEXT NOT NULL DEFAULT '',
  leader TEXT NOT NULL DEFAULT '',
  workout_name TEXT,
  selected_variations TEXT[] NOT NULL DEFAULT '{""}'
);

-- #201: add selected_variations to existing schedule tables
ALTER TABLE schedule ADD COLUMN IF NOT EXISTS selected_variations TEXT[] NOT NULL DEFAULT '{""}';

CREATE TABLE IF NOT EXISTS races (
  date DATE NOT NULL,
  name TEXT NOT NULL,
  distance TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (date, name)
);

CREATE TABLE IF NOT EXISTS run_leaders (
  id SERIAL PRIMARY KEY,
  run_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INT,
  active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (run_id, name)
);
