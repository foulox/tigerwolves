# Claude Code — tigerwolves

## What This Is
A mobile-first web app for **North Brooklyn Runners (NBR)**. Currently serves TigerWolves — the Tuesday morning quality workout run. The long-term vision is to expand to all NBR runs (MMER, Mourning Doves, Helkatz, and others), each with their own identity, meeting spot, leaders, and Heylo post format.

Live at: https://tigerwolves.vercel.app
Staging: https://tigerwolves-cpc3mdtlk-fouloxs-projects.vercel.app

## Club Context
- **Club:** North Brooklyn Runners (NBR)
- **TigerWolves** — Tuesday morning quality workout run (what this app currently serves)
- **Other NBR runs:** MMER (Monday), Mourning Doves (Wednesday), Helkatz (Thursday) — 2-3 runs per day across the week
- Each run has its own name, meeting location, route, leader pool, and Heylo post template
- Not all runs meet at Da Bins — the Da Bins location and Kent Ave route in `buildPost` are TigerWolves-specific

## Stack
- **Frontend:** Next.js 16 (App Router) + Tailwind CSS v4
- **Auth:** Clerk v7 (`@clerk/nextjs` v7.5.2) — leaders sign in, visitors get read-only
- **Hosting:** Vercel (free, auto-deploys from `main`)
- **Data source:** Google Sheets via Google Apps Script JSON endpoint
- **Write-back:** Apps Script `doPost()` — add, edit, delete workouts; regroup families; set schedule

## Architecture
- Server components fetch data and pass it to client components as props
- `lib/sheets.ts` — fetches from Apps Script, normalizes data
- `lib/data.ts` — TypeScript types and constants only
- `lib/workoutForm.ts` — shared UI constants for add/edit forms (FORM_CATEGORIES, FORM_TYPES, chip styles, toggleItem)
- `app/actions.ts` — server actions; all Sheets POSTs go through `sheetsPost()` helper which checks `res.ok` before parsing JSON; all write actions check `auth()` first and throw `Unauthorized` if no userId
- `scripts/apps-script.gs` — the full Apps Script source (doGet + doPost); keep in sync when adding new actions
- `proxy.ts` — Clerk middleware (NOT `middleware.ts` — renamed to avoid Next.js 16 deprecation warning)
- 5-minute cache revalidation (`next: { revalidate: 300 }`); on-demand revalidation after writes

## Auth Architecture (Clerk)
- **Visitors** — read-only: Schedule, Library, Races. No sign-in required.
- **Leaders** — sign in via `/sign-in` (Clerk-hosted UI). Plan tab appears after sign-in.
- `proxy.ts` uses `clerkMiddleware` + `createRouteMatcher`; public routes: `/`, `/library`, `/races`, `/sign-in(.*)`, `/sign-up(.*)`
- Server components call `auth()` from `@clerk/nextjs/server`, pass `isLeader={!!userId}` to client children
- Client components use `useAuth()` for reactive auth state (e.g. `BottomNav` shows/hides Plan tab)
- `HeaderAuth` component on Schedule page: shows "Sign in" link for visitors, `<UserButton />` for leaders
- `LeaderBadge` (UserButton) appears top-right on Library and Races pages when signed in
- `/api/workout/infer` route returns 401 if unauthenticated
- Clerk keys in `.env.local` (not committed) and Vercel environment variables

## Google Sheets Setup
Two spreadsheets:

**TigerWolves Schedule sheet** (contains the Apps Script):
- `Schedule` tab — Date, Workout Type, Leader, Workout Name
- `Races` tab — Date, Name, Distance, Location
- Apps Script serves all data via `doGet()` and accepts new workouts via `doPost()`

**Workout Library sheet** (standalone, shared across run groups):
- `Workouts` tab — Workout Name, Sport, Category, Type, Reason / Purpose, Instructions, Dist/Time, Lap Structure, Energy System, HR Zone, RPE, Last Ran, Coaching Notes, Map Link, Variation, Progression, Author, Race Type, Training Phase
- Accessed by the Apps Script using `SpreadsheetApp.openById(WORKOUT_LIBRARY_ID)`
- Sheet ID: `1DqYt4POBIzdj1FbKzImN06CVocGFbgeB1UTOkz0pqpc`

The Apps Script web app URL is stored in `SHEETS_URL` env var (Vercel + `.env.local`).

**Updating the Apps Script:** Edit `scripts/apps-script.gs`, paste into the Apps Script editor, then Deploy → Manage deployments → New version. The SHEETS_URL does not change between versions.

## Core Screens
1. **Schedule** (`/`) — upcoming Tuesdays: leader, workout type, workout name
2. **Plan** (`/plan`) — pick a workout for the week; generates Heylo post draft with one-tap copy
3. **Workout Library** (`/library`) — browse/filter by Category then Type; "+" add, ✎ edit, 🗑 delete on every card
4. **Races** (`/races`) — upcoming races with day countdown; red highlight if ≤30 days out
5. **Admin** (`/admin`) — Regroup standalone workouts into a family (structural changes only)

## Heylo Post Format
`buildPost` in `components/PlanClient.tsx` generates the post. Key details:
- Location block is TigerWolves-specific (Da Bins, Kent Ave Speedway, Marsha P. Johnson)
- Turn-around is auto-computed from interval durations — handles `N×(Xs/Ys)`, `N×(Xmin/Ymin)`, `N sets of`, and `/`-separated formats; falls back to `[add before posting]`
- `RUN_LEADERS` constant in `lib/data.ts` — update when the leader pool changes
- When expanding to other NBR runs, location/route/leaders will need to be per-run config, not hardcoded

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

## Run Leaders (TigerWolves Tuesday)
Luis, Lou (creator/user), Kostas, Matthew, Joelle, Kelsey, Obi, Jared
Note: Matthew is being removed in UX Sprint story #67 — `RUN_LEADERS` in `lib/data.ts` is the source of truth

## Key Constraints
- Volunteer club, no budget — keep hosting and services free/cheap
- Mobile-first: late posts happen because planning requires a computer
- Non-technical users: UI must be simple enough that it can't be "broken"
- `touch-manipulation` on all interactive elements to fix mobile Safari tap issues

## Development Workflow

### PR-per-story workflow
Every story ships as a PR, not a direct commit to `main`:

1. **Pick a story** from open GitHub issues
2. **Branch:** `story/N-short-slug`
3. **Build** the story, referencing AC from the issue
4. **Self-review** before opening the PR (see checklist below)
5. **Open PR** with `closes #N` in the body
6. **Vercel builds a preview URL** — Lou tests on mobile before anything hits production
7. **Prompt Lou to run `/review`** on any PR touching more than one file
8. **Lou reviews and merges** — production deploys automatically

### Stacked PRs and rebasing
When stories are code-dependent (e.g. story B needs story A's package installed), branch each story from the previous: `main ← A ← B ← C`. After merging with squash merge, remaining branches need rebasing:
```bash
git checkout story/B && git rebase origin/main
git push --force-with-lease origin story/B
```
Do this for all remaining branches after each merge. Also check for duplicate files after rebase — squash merges can cause `middleware.ts` / `proxy.ts`-style conflicts where both versions appear.

### Self-review checklist (mandatory before every PR)
- [ ] Does the implementation match every AC in the story?
- [ ] Edge cases covered?
- [ ] Security issues — unvalidated input, exposed secrets, injection risks?
- [ ] Consistent with project conventions (server components, Tailwind, touch-manipulation)?
- [ ] TypeScript clean — `npx tsc --noEmit` zero errors
- [ ] No dead code, debug logs, or temporary hacks

### Testing standard
UI components: no unit tests — verify by running the app.
`lib/*.ts` changes: TDD required.

### `/review` rule
After opening a PR touching more than one file, always tell Lou:
> "This PR touches X files. Run `/review` before merging."

### GitHub label ownership
`ready-to-build` is Lou's label to apply — it means Lou has reviewed and cleared the story to build. Claude must never add it.

### Never commit directly to main
All code changes go through a PR. CLAUDE.md updates are the only exception.

### Session wrap-up
When Lou signals the session is ending:
- Did any architectural decisions get made that aren't in CLAUDE.md?
- Is there anything a future agent would need that isn't in git or GitHub?
- Which story is up next?

## GitHub Project
Issues tracked in **@foulox's Running Apps** GitHub Project (shared with trainer_v1).
Labels: `epic`, `story`, `bug`, `backlog`, `ready-to-build`, `run-ux`, `library`, `multi-run`
