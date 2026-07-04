# TigerWolves

Mobile-first workout planning app for the TigerWolves run club. ~8 rotating leaders use it to plan and post weekly Tuesday workouts to Heylo.

**Live:** https://tigerwolves.vercel.app

## What it does

- **Schedule** — see the full upcoming Tuesday calendar: who's leading, what type of workout
- **Plan** — pick a workout for the week, get a ready-to-paste Heylo post
- **Workout Library** — browse all workouts filtered by category and type; add new ones directly from the app
- **Races** — upcoming races with countdowns for context when planning

## Stack

- Next.js 16 (App Router) + Tailwind CSS v4
- Vercel (free tier, auto-deploys from `main`)
- Neon Postgres, queried directly via `@neondatabase/serverless`

## Local development

```bash
npm install
npm run dev
```

Requires a `.env.local` file with `DATABASE_URL` (Neon connection string) and the Clerk keys. Run `npx vercel env pull` to get current values from Vercel.
