# Claude Code — tigerwolves

## What This Is
A mobile-first web app for **North Brooklyn Runners (NBR)**. Currently serves TigerWolves — the Tuesday morning quality workout run. The long-term vision is to expand to all NBR runs (MMER, Mourning Doves, Helkatz, and others), each with their own identity, meeting spot, leaders, and Heylo post format.

Live at: https://tigerwolves.foulox.me (custom domain, since the 2026-07-03 Clerk production cutover — `tigerwolves.vercel.app` still works as a fallback alias)
Staging: https://tigerwolves-git-staging-fouloxs-projects.vercel.app (stable branch alias — don't use a specific deployment URL here, those change every deploy)
Demo: https://tigerwolves-git-demo-fouloxs-projects.vercel.app (long-lived `demo` branch; env var `NEXT_PUBLIC_DEMO_MODE=true` + `NEXT_PUBLIC_DEMO_LEADER_EMAIL`; no auth required for participant routes)

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
- **Data source:** Neon Postgres, queried directly via `@neondatabase/serverless` (raw SQL, no ORM) — migrated off Google Sheets in #85 (2026-07-03), Apps Script/Sheets glue fully removed in #86
- **Analytics:** PostHog (`posthog-js` client-side, `posthog-node` server-side) — anonymous only, no PII, no `posthog.identify()` (#151, 2026-07-06). Both gracefully no-op if the key isn't set. Installed via the Vercel Marketplace integration ("Feature Flags and A/B tests" listing — we only use its core analytics/replay product, not flags). Env vars are `NEXT_PUBLIC_NEXT_PUBLIC_POSTHOG_POSTHOG_PROJECT_TOKEN` / `NEXT_PUBLIC_NEXT_PUBLIC_POSTHOG_POSTHOG_HOST` — doubled prefix because the integration's own variable names already started with `NEXT_PUBLIC_POSTHOG_` before our custom prefix was applied on top. Cosmetic only, not worth fixing.
- **Error tracking:** Sentry (`@sentry/nextjs`) — installed via the Vercel Marketplace integration (an initial `billingPlanId` error on this account was transient and resolved on retry). `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN`/`NEXT_PUBLIC_SENTRY_DSN` are Vercel env vars (Preview + Production).

## Architecture
- Server components fetch data and pass it to client components as props
- `lib/db.ts` — raw SQL queries/mutations against Neon; row-to-type mapping; also exports `fetchData`, an `unstable_cache`-wrapped aggregate read (tag: `tigerwolves-data`, `revalidate: 300`) that pages import directly
- `lib/data.ts` — TypeScript types and constants only
- `lib/postBuilder.ts` — `buildPost`, `computeTurnaround`, interval parsers (pure functions, imported by `PlanClient.tsx`)
- `lib/workoutForm.ts` — shared UI constants for add/edit forms (FORM_CATEGORIES, FORM_TYPES, chip styles, toggleItem)
- `lib/analytics.ts` — server-side PostHog capture helper (`posthog-node`), used by `app/actions.ts` write actions; `lib/analyticsClient.ts` — client-side equivalent (`posthog-js`), used by `PostHogInit.tsx` and `PlanClient.tsx`. Split into two files (not the single helper originally sketched in #151) because `posthog-node` can't be bundled into client components without breaking the browser build.
- `app/actions.ts` — server actions; every write action calls `requireAuth()` (throws `Unauthorized` if no `userId`) then a `lib/db.ts` mutation, then `revalidateAll()` (`revalidatePath` + `updateTag('tigerwolves-data')` — not `revalidateTag`, which needs an extra profile arg in this Next.js version); write actions also fire a named PostHog event via `lib/analytics.ts` after the mutation
- `createFeedbackIssue` (`app/actions.ts`) is the odd one out in that file — unauthenticated (visitors can submit feedback), and its own GitHub side effect rather than a DB mutation. After creating the issue via REST, it links it to the **Running Apps GitHub Project board** (`RUNNING_APPS_PROJECT_ID` constant, GraphQL `addProjectV2ItemById`) via `after()` from `next/server`, so linking never delays the response the user is waiting on. One retry, then reports to Sentry on failure (not swallowed) — see #179 for why: every feedback issue was a floating orphan on the project board until this was added.
- `scripts/migrate.sql` — Neon schema; `scripts/seed.ts` — one-time ETL from Sheets, kept as historical record of the migration, not part of the live app
- `proxy.ts` — Clerk middleware (NOT `middleware.ts` — renamed to avoid Next.js 16 deprecation warning); hardcodes `signInUrl: '/sign-in'` as a `clerkMiddleware()` option — don't move this back to an env var, see Auth Architecture below
- 5-minute cache TTL via `unstable_cache`; on-demand invalidation via `updateTag` after every write
- `instrumentation.ts` / `instrumentation-client.ts` / `sentry.server.config.ts` / `sentry.edge.config.ts` / `app/global-error.tsx` — Sentry wiring, scaffolded by hand (the `@sentry/wizard` CLI needs an interactive TTY/browser login, which isn't available in an agent-driven terminal session)
- `lib/demo.ts` — exports `isDemoMode` (`NEXT_PUBLIC_DEMO_MODE === 'true'`) and `demoVoteData(workoutId)` (deterministic fake vote data for the demo environment). `isDemoMode` is used in `components/DemoBanner.tsx` (server) and `components/ReactionPicker.tsx` (client) to suppress DB writes. In demo mode, `/api/vote` is also a no-op server-side. Reactions write to localStorage only.

## Auth Architecture (Clerk)
- **Visitors** — read-only: Schedule, Library, Races. No sign-in required.
- **Leaders** — sign in via `/sign-in` — the app's own custom page, not Clerk's hosted Account Portal. Plan tab appears after sign-in.
- `proxy.ts` uses `clerkMiddleware` + `createRouteMatcher`; public routes: `/`, `/library`, `/races`, `/sign-in(.*)`, `/sign-up(.*)`. `signInUrl: '/sign-in'` is passed as a `clerkMiddleware()` option directly in code — without it, `auth.protect()` falls back to redirecting unauthenticated visits to Clerk's Account Portal instead, which caused a real production sign-in loop bug (#157, fixed 2026-07-03). Don't move this back to an env var.
- Server components call `auth()` from `@clerk/nextjs/server`, pass `isLeader={!!userId}` to client children
- Client components use `useAuth()` for reactive auth state (e.g. `BottomNav` shows/hides Plan tab)
- `HeaderAuth` component on Schedule page: shows "Sign in" link for visitors, `<UserButton />` for leaders
- `LeaderBadge` (UserButton) appears top-right on Library and Races pages when signed in
- `/api/workout/infer` route returns 401 if unauthenticated
- Clerk keys in `.env.local` (not committed) and Vercel environment variables

**Security note — `isLeader` has no independent role check.** It is literally `!!userId` everywhere it's used (`HeaderAuth`, `LibraryClient`, `requireAuth()` in `app/actions.ts`). Anyone with a valid Clerk session gets full write access — add/edit/delete workouts, regroup families, everything. This is only safe because the **Production Clerk instance has Restricted mode enabled** (Configure → Protect → Restrictions) — self sign-up is disabled, so a session can only exist for someone Lou explicitly invited. **Never disable Restricted mode on Production** without adding a real role/allowlist check first. Worth hardening properly if/when the app opens up to public participant accounts (Release 2 in the roadmap).

## Core Screens
1. **Schedule** (`/`) — upcoming Tuesdays: leader, workout type, workout name
2. **Plan** (`/plan`) — pick a workout for the week; generates Heylo post draft with one-tap copy
3. **Workout Library** (`/library`) — browse/filter by Category then Type; "+" add, ✎ edit, 🗑 delete on every card
4. **Races** (`/races`) — upcoming races with day countdown; red highlight if ≤30 days out
5. **Admin** (`/admin`) — Regroup standalone workouts into a family (structural changes only)

## Heylo Post Format
`buildPost` in `lib/postBuilder.ts` generates the post (extracted from `PlanClient.tsx` in story #121, with Vitest coverage). Key details:
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
Luis, Lou (creator/user), Kostas, Joelle, Kelsey, Obi (Matthew removed via #67; Jared never signed in, status unclear) — `RUN_LEADERS` in `lib/data.ts` is the source of truth

## Key Constraints
- Volunteer club, no budget — keep hosting and services free/cheap
- Mobile-first: late posts happen because planning requires a computer
- Non-technical users: UI must be simple enough that it can't be "broken"
- `touch-manipulation` on all interactive elements to fix mobile Safari tap issues

## Tooling Notes
- **Vercel CLI must be v54+** for reliable non-interactive env var management — v52's `vercel env add <name> preview --value ... --yes` (no git-branch arg, meant to apply to all Preview branches) silently fails with a `git_branch_required` error even though the CLI's own suggested fix is the exact command you just ran. Use `npx vercel@latest` for env commands if the global install is older.
- Vercel's Neon integration auto-provisions an isolated DB branch per git branch (`preview/<branch-name>`) for Preview deployments — `vercel env ls` showing one `DATABASE_URL` name for both Preview and Production does NOT mean they share a value; the integration resolves it differently per deployment. Verify actual isolation via `neonctl branches list` if this matters, don't infer from `env ls` alone.
- **Neon's free tier caps at 10 branches**, and old story branches' Neon branches do NOT get cleaned up automatically — not even when the git branch itself is deleted (confirmed 2026-07-06: two Neon preview branches for already-deleted git branches were still sitting there). Hitting the cap makes a *new* branch's Preview deployment fail the build with `DATABASE_URL is not set`, which looks like a code/env bug but isn't. After a story merges, delete its Neon branch directly (`neonctl branches delete <id> --project-id <id>`) — don't assume deleting the git branch is enough. `neonctl` needs an interactive browser OAuth on first use, but non-interactive flags (`--project-id`, `--org-id`) skip the CLI's interactive picker menus once a cached credential exists (`~/.config/neonctl/credentials.json`).
- **Local `next dev`/`next build` don't work** — `DATABASE_URL`, `GITHUB_TOKEN`, and other secrets were only ever provisioned in Vercel for Preview and Production, never Development. This is a deliberate (if implicit) choice, not a bug: testing happens via Vercel Preview URLs for every PR, not local dev. `vercel env pull` won't fix this — pulling the Development environment returns almost nothing, confirming those vars simply don't exist for that target.
- **`vercel env pull` always returns empty for `DATABASE_URL`** — Vercel's Neon integration resolves `DATABASE_URL` dynamically at deploy time; the value is never stored as a static env var you can pull. Don't try to use `vercel env pull` to get it. Instead, fetch the connection string directly via the Neon REST API: `curl -H "Authorization: Bearer $TOKEN" "https://console.neon.tech/api/v2/projects/{project-id}/connection_uri?branch_id={branch-id}&database_name=neondb&role_name=neondb_owner"`. The token lives at `~/.config/neonctl/credentials.json`. tigerwolves project ID: `spring-salad-36742894`. Production branch: `br-square-river-atjn0mzq`. Staging branch: `br-tiny-darkness-at3q6q1y`.
- **`.env.local`'s `DATABASE_URL` points at production** — if `.env.local` has a `DATABASE_URL` value at all, it is the production Neon branch. Treat it as production when running migrations.
- **In agent sessions, use the Neon REST API directly instead of `neonctl` or `npx neonctl`** — `neonctl` requires an interactive browser OAuth on first use, and `npx neonctl` still prompts for org selection interactively even with a cached credential. Neither works in a non-TTY agent session. Use the curl pattern above.
- **Always `git fetch origin main` before reading files at the start of a new branch session** — read key files from `git show origin/main:{file}` rather than the local checkout; the local branch may be stale from a previous session on a different machine.
- **`chromium-cli` is not available in this environment.** For browser-driven verification, write a throwaway Playwright script instead — `@playwright/test` is already a devDependency, and Chromium is typically already installed locally. Suppress the onboarding tour's auto-launch in fresh browser contexts by setting `localStorage` (`tw_tour_seen`, `tw_version`) via `page.addInitScript()` before navigating, or it'll intercept clicks.
- **`@vercel/kv` is deprecated** — Vercel KV migrated to Upstash Redis. The package API is unchanged (`kv.mget`, `kv.pipeline`, etc.) and `KV_REST_API_URL` / `KV_REST_API_TOKEN` env vars are still the right names. Install via Vercel Marketplace → Upstash for Redis, prefix `KV`, Production + Preview environments. Don't use the "Official Redis Cloud" integration — that's a different product with no free tier and incompatible env vars.
- **vitest `@/` path alias** — `vitest.config.ts` has `resolve.alias: { '@': path.resolve(__dirname, '.') }` so route handler tests can use `@/` imports. Already in place; don't remove it.

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
- [ ] Does this PR change anything CLAUDE.md documents (architecture, data flow, key files, URLs)? Update CLAUDE.md in the same PR — don't defer doc updates to session-end, they go stale fast (found during the #85 `/review` pass, 2026-07-03)

### Testing standard
UI components: no unit tests — verify by running the app.
`lib/*.ts` changes: TDD required.

### `/review` rule
After opening a PR touching more than one file, always tell Lou:
> "This PR touches X files. Run `/review` before merging."

### GitHub label ownership
`ready-to-build` is Lou's label to apply — it means Lou has reviewed and cleared the story to build. Claude must never add it.

### Epic tracking (added 2026-07-04)
- Epics track their stories via GitHub's native **sub-issues** (parent/child linking), not markdown checklists — checklists can't show real progress and silently drift from actual state. Link every story to its epic with `gh api repos/foulox/tigerwolves/issues/{epic}/sub_issues -F sub_issue_id={story's numeric id}` (note: the issue's internal `id`, not its `number`).
- Whenever a story closes, check whether it was the last open sub-issue on its epic — if so, close the epic too. Found 3 epics this session (`#82`, `#23`, `#69`) that were 100% done but silently left open because nobody checked.
- New releases get a matching GitHub milestone at creation, not retrofitted later — lets the Project board's milestone filter work for browsing by release from day one.

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
