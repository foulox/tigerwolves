# Story #492 — Domain cutover to `nbr.foulox.me` (+ Clerk cutover)

**Epic:** #466 (Phase 1 — Become the NBR app)
**Type:** Operations runbook, not a code build. No source changes — DNS, Clerk dashboard, Vercel env/domain, and a Vercel-level redirect. There is no TDD breakdown because there is no code to test; verification is live (health endpoint + Playwright sign-in).

## Decisions (resolved in grooming, 2026-10-10)

- **Reuse the existing Clerk production instance** via Clerk's **Change domain** (dashboard Danger zone) — never a new instance. Same instance means user accounts and `publicMetadata.role` survive; only sessions are invalidated (everyone signs in once). Verified against Clerk docs: changing the primary domain preserves users, logs sessions out, and generates a **new publishable key** that must be updated and redeployed.
- **Silent redirect** `tigerwolves.foulox.me` → `nbr.foulox.me` (Vercel-level). No "we moved" interstitial — the reskin carries the NBR identity and Lou announces the move. Same for demo.
- **Demo first as the dry-run**, and `demo.nbr.foulox.me` becomes the permanent demo home. Treat demo like prod: identical redirect behavior on both.
- **Single story, two sequential phases.** Phase A (demo) gates Phase B (prod) — demo is the evidence that the procedure is safe.

## Known constraints / guardrails

- **#157 sign-in-loop guardrail:** `proxy.ts` hardcodes `signInUrl: '/sign-in'`. Must stay — without it `auth.protect()` falls back to Clerk's Account Portal and causes a production sign-in loop. (Confirmed present in `proxy.ts` at grooming.)
- The publishable-key swap is the silent failure mode: forget it and the app loads with a stale key → "Clerk failed to load." Update `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` in the right Vercel project and redeploy as part of each phase.
- The demo dry-run validates the **procedure** (DNS, key swap, redeploy, roles survive), not prod's user set — the demo Clerk instance is separate from prod.

## Legend

- **[Lou]** — needs a Clerk / Vercel / DNS-registrar login; Lou's hands.
- **[Claude]** — live verification Claude can run (health endpoint, Playwright).

---

## Phase A — Demo dry-run → `demo.nbr.foulox.me`

Target: `tigerwolves-demo` Vercel project, `tigerwolves-demo` Clerk application (**Development instance only**, `romantic-oriole-1639`, `pk_test_…`), `demo-data` Neon branch.

> **Corrected at build time (2026-10-16):** the demo Clerk app has no production instance. Development instances run on Clerk's own `*.accounts.dev` domain — there is no Change domain, no `clerk.` CNAME, and no new publishable key. Phase A therefore rehearses DNS, the Vercel domain, the redirect, and signed-in behavior on a new hostname — **not** the Clerk Change-domain + key swap. Those happen for the first time in Phase B; see the before/after role check there. Creating a demo production instance to rehearse it was considered and rejected: it's a fresh instance (users not carried over), so it rehearses new-instance setup, not Change domain.

1. **[Lou]** Vercel (`tigerwolves-demo`): add `demo.nbr.foulox.me`, set primary.
2. **[Lou]** DNS: add the record Vercel shows for `demo.nbr.foulox.me` (expected `CNAME → cname.vercel-dns.com`).
3. **[Lou]** Vercel: `demo.tigerwolves.foulox.me` → silent redirect to `demo.nbr.foulox.me`.
4. **[Claude]** Verify:
   - `demo.nbr.foulox.me/api/health` → `{ ok: true, dbHost: ep-ancient-math-… }` (demo-data).
   - Playwright sign-in as `foulox+demo@gmail.com` succeeds on the new hostname; account has `role: leader`; demo content intact; still `pk_test_cm9tYW50aWMtb3Jpb2xl…`.
   - `demo.tigerwolves.foulox.me` 308-redirects to `demo.nbr.foulox.me`.

**Gate:** Phase A passes clean before Phase B is touched.

---

## Phase B — Production → `nbr.foulox.me`

Target: `tigerwolves` Vercel project, **prod** Clerk instance, production Neon branch.

1. **[Lou]** Choose a low-traffic window — never near Tuesday-morning run time.
   **[Claude]** Baseline before touching anything: Playwright sign-in as the test-leader on `tigerwolves.foulox.me`; record the account's `role` and the current `pk_live_…` key. This is the "before" half of the role-survival check.
2. **[Lou]** DNS: add `nbr.foulox.me` + `clerk.nbr.foulox.me` CNAMEs.
3. **[Lou]** Vercel (`tigerwolves`): add `nbr.foulox.me`, set primary.
4. **[Lou]** Clerk (**prod instance**): Change domain → `nbr.foulox.me`; complete DNS/SSL.
5. **[Lou]** New publishable key → update `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` in `tigerwolves` prod env → redeploy.
6. **[Lou]** Vercel: `tigerwolves.foulox.me` → silent redirect to `nbr.foulox.me`.
7. **[Claude]** Verify:
   - `nbr.foulox.me/api/health` → `ok` + production `dbHost`.
   - Playwright sign-in as the test-leader account succeeds with `role: leader`.
   - `tigerwolves.foulox.me` 308-redirects to `nbr.foulox.me`.
8. **[Lou]** Announce to the ~20 users: "We've moved to nbr.foulox.me — please sign in again."

### As executed (2026-10-16) — read this before any future Clerk domain change

- **Choose "Secondary application" in the Change domain dialog.** It asks *Primary application* (Clerk stays on the root domain: `clerk.foulox.me`, email from `@foulox.me`) vs *Secondary application* (Clerk scoped to the subdomain: `clerk.nbr.foulox.me`, email from `@nbr.foulox.me`). The old `tigerwolves.foulox.me` setup was the Secondary shape. Picking Primary moved Clerk to `foulox.me` and cost a ~45 min sign-in outage until a second Change domain fixed it. Read the bullet points under each option — they name the exact FAPI host.
- **Pre-add the frontend/accounts CNAMEs before clicking Change domain** (`clerk.<sub>` → `frontend-api.clerk.services`, `accounts.<sub>` → `accounts.clerk.services`) — Clerk verified them within seconds. The **three email CNAMEs get new values on every domain change** (`mail./dkim1./dkim2.<token>.clerk.services`, new token each time); add them after the change, from the dashboard.
- **Social login with custom credentials:** add `https://clerk.<new-domain>/v1/oauth_callback` (and the app origin) to the Google OAuth client *before* the change. Done; old entries kept until cleanup.
- **Publishable key is deterministic** — `pk_live_` + base64(`clerk.<domain>$`) with padding stripped — so it can be set in Vercel and redeployed without waiting for the dashboard. Vercel CLI ≥64 refuses `--sensitive` for `NEXT_PUBLIC_*`; use `--type config`.
- **Redirects** are Vercel per-domain redirects (`PATCH /v9/projects/<p>/domains/<d>` with `redirect`, `redirectStatusCode: 308`). Vercel refuses to redirect a domain that another domain already redirects *to* — retarget the other one first.
- Prod Google OAuth custom credentials meant the demo dry-run could not rehearse this; Development instances use Clerk's shared credentials.

---

## Acceptance criteria

- [ ] `demo.nbr.foulox.me` serves the app on the demo instance; `demo.tigerwolves.foulox.me` redirects to it.
- [ ] Demo leader (`foulox+demo@gmail.com`) retains `role: leader` after the demo cutover — proven, not assumed.
- [ ] `nbr.foulox.me` serves the app on the prod instance; `tigerwolves.foulox.me` redirects to it.
- [ ] A production leader retains `role: leader` after the prod cutover.
- [ ] `signInUrl: '/sign-in'` still present in `proxy.ts`; no sign-in loop on either domain.
- [ ] `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` updated in the `tigerwolves` (prod) Vercel project — demo's Development instance has no key change; no "Clerk failed to load" on either domain.
- [ ] Users announced to after prod cutover.

## Out of scope

- `app.northbrooklynrunners.org` (Phase 3 — `nbr.foulox.me` is explicitly the temporary home).
- Any Clerk-instance migration or user re-creation (reuse-in-place is the whole point).
- Code changes of any kind.
