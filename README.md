# TigerWolves

Mobile-first workout planning app for the TigerWolves run club. ~8 rotating leaders use it to plan and post weekly Tuesday workouts to Heylo.

**Live:** https://tigerwolves.vercel.app

## What it does

- **Schedule** — see the full upcoming Tuesday calendar: who's leading, what type of workout
- **My Week** — open on your week, pick a workout from least-recently-used suggestions, get a ready-to-paste Heylo post
- **Workout Library** — browse all workouts filtered by category and type; add new ones directly from the app
- **Races** — upcoming races with countdowns for context when planning

## Stack

- Next.js 16 (App Router) + Tailwind CSS v4
- Vercel (free tier, auto-deploys from `main`)
- Google Sheets as the database, accessed via a Google Apps Script JSON endpoint

## Local development

```bash
npm install
npm run dev
```

Requires a `.env.local` file with:
```
SHEETS_URL="<apps-script-web-app-url>"
```

Run `npx vercel env pull` to get the current value from Vercel.
