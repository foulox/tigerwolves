# Claude Code — tigerwolves

## What This Is
A mobile-first web app for the TigerWolves run club. Replaces a brittle Google Sheet used by ~8 rotating run leaders to plan and post weekly Tuesday workouts to Heylo.

Live at: https://tigerwolves.vercel.app

## Stack
- **Frontend:** Next.js 16 (App Router) + Tailwind CSS v4
- **Hosting:** Vercel (free, auto-deploys from `main`)
- **Data source:** Google Sheets via Google Apps Script JSON endpoint
- **Write-back:** Apps Script `doPost()` for adding new workouts

## Architecture
- Server components fetch data and pass it to client components as props
- `lib/sheets.ts` — fetches from Apps Script, normalizes data
- `lib/data.ts` — TypeScript types and constants only
- `app/actions.ts` — server actions (add workout → revalidate cache)
- 5-minute cache revalidation (`next: { revalidate: 300 }`); on-demand revalidation after writes

## Google Sheets Setup
Two spreadsheets:

**TigerWolves Schedule sheet** (contains the Apps Script):
- `Schedule` tab — Date, Workout Type, Leader, Workout Name
- `Races` tab — Date, Name, Distance, Location
- Apps Script serves all data via `doGet()` and accepts new workouts via `doPost()`

**Workout Library sheet** (standalone, shared across run groups):
- `Workouts` tab — Workout Name, Sport, Category, Type, Reason / Purpose, Instructions, Dist/Time, Lap Structure, Energy System, HR Zone, RPE, Last Ran, Coaching Notes, Map Link
- Accessed by the Apps Script using `SpreadsheetApp.openById(WORKOUT_LIBRARY_ID)`
- Sheet ID: `1DqYt4POBIzdj1FbKzImN06CVocGFbgeB1UTOkz0pqpc`

The Apps Script web app URL is stored in `SHEETS_URL` env var (Vercel + `.env.local`).

## Core Screens
1. **Schedule** (`/`) — upcoming Tuesdays: leader, workout type, workout name
2. **My Week** (`/my-week`) — defaults to current week's leader; chevron arrows to navigate future weeks; pick from least-recently-used suggestions; generates Heylo post draft with one-tap copy
3. **Workout Library** (`/library`) — browse/filter by Category then Type; "+" button opens add-workout form
4. **Races** (`/races`) — upcoming races with day countdown; red highlight if ≤30 days out

## Workout Type Rotation (by Tuesday-of-month)
- 1st Tuesday → Hills
- 2nd Tuesday → Broken Tempo
- 3rd Tuesday → Progression
- 4th Tuesday → Ladder or Superset
- 5th Tuesday → Straight Tempo or Threshold

Schedule entries use compound types ("Ladder or Superset"); the library tags individual workouts with the specific type. The suggestion filter splits on " or " to match both.

## Workout Categories
- **Quality** — Hills, Broken Tempo, Progression, Ladder, Superset, Straight Tempo, Threshold
- **Long** — long runs
- **Easy** — easy runs, recovery (Recovery is a Type within Easy)

## Run Leaders
Luis, Lou (creator/user), Kostas, Matthew, Joelle, Kelsey, Obi, Jared

## Key Constraints
- Volunteer club, no budget — keep hosting and services free/cheap
- Mobile-first: late posts happen because planning requires a computer
- Non-technical users: UI must be simple enough that it can't be "broken"
- `touch-manipulation` on all interactive elements to fix mobile Safari tap issues
