# Story B — Offline read-only (service worker) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the public read-only surface viewable with no/bad connectivity via a Serwist service worker, without ever caching auth or write paths.

**Architecture:** A Serwist (`@serwist/next`) service worker, compiled from `app/sw.ts` to `public/sw.js`, nested inside the existing `withSentryConfig` wrapper. A pure, unit-tested cache-policy module (`lib/sw-cache-policy.ts`) classifies each request into cache-first / stale-while-revalidate / network-only; `app/sw.ts` maps those classifications onto Serwist handlers. A branded `/offline` page is the navigation fallback. Writes, auth, and leader routes are network-only — never cached.

**Tech Stack:** Next.js 16.2.4 (App Router), `@serwist/next` + `serwist`, `@sentry/nextjs` (existing), vitest (unit), Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-10-03-story-465b-offline-read-only-design.md`

## Global Constraints

- **Next.js is 16.2.4.** Serwist's officially-tested ceiling is Next 15. The build MUST confirm `@serwist/next` works on 16. If it does not build, **STOP and escalate to Lou** — do not downgrade Next, pin an unsupported combo, or silently swap to a hand-rolled SW.
- **Never cache Clerk, `/api/*`, `/schedule`, or `/my-plan`.** These are network-only. The SW must never serve a stale auth state or a cached write-view. This is the correctness-critical invariant of the whole story.
- **Cached public surface is exactly:** `/all-runs`, `/library`, `/races`, `/runs/[slug]`. Nothing else is cached for navigation.
- **Silent auto-update:** `skipWaiting: true` + `clientsClaim: true`. No "new version available, refresh?" prompt.
- **Serwist disabled in development** (`disable: process.env.NODE_ENV === 'development'`) so local `next dev` e2e runs are unaffected; the SW is active only in production builds (CI `npm run build && npm run start`, Preview, production).
- **No local `next dev`/`next build` with prod secrets** — SW behavior is verified on the **Preview URL** and in CI, not local dev.
- Mobile-first; any icon-only button needs an `aria-label` (the offline page uses text links, so this is satisfied by using text).

## Review Focus

- **Never-visited route, then offline** → must show the branded `/offline` fallback, not a blank page or stale content. (Task 4)
- **Clerk / `/schedule` / `/my-plan` requested offline** → must fail through to the fallback; must NOT serve a cached authed/write view. (Task 1 unit + Task 4 e2e)
- **SWR revalidation fails offline** → serve the cached copy silently, no error overlay. (Task 4, second offline load)
- **New deploy with an old SW already installed** → silent update; next navigation serves fresh, old code never pinned forever. Pinned by `skipWaiting`/`clientsClaim` config. (Task 3 config assertion)
- **SW must not break the existing e2e suite / public routes on first (cache-empty) load.** (Task 3 — full CI suite green is the check.)

---

### Task 1: Pure cache-policy module (the scope guard)

The safety-critical classification lives in a pure function so it can be exhaustively unit-tested with no build. `app/sw.ts` (Task 3) consumes it.

**Files:**
- Create: `lib/sw-cache-policy.ts`
- Test: `__tests__/swCachePolicy.test.ts`

**Interfaces:**
- Produces:
  - `type CacheStrategy = 'cache-first' | 'stale-while-revalidate' | 'network-only'`
  - `function classifyRoute(pathname: string): CacheStrategy` — classifies a navigation/data request by pathname.
  - `const SWR_ROUTES: string[]` — exact public routes cached stale-while-revalidate.
  - `const NETWORK_ONLY_PREFIXES: string[]` — path prefixes that must never be cached.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/swCachePolicy.test.ts
import { describe, test, expect } from 'vitest'
import { classifyRoute } from '../lib/sw-cache-policy'

describe('classifyRoute (#465 Story B scope guard)', () => {
  test('the four public routes are stale-while-revalidate', () => {
    expect(classifyRoute('/all-runs')).toBe('stale-while-revalidate')
    expect(classifyRoute('/library')).toBe('stale-while-revalidate')
    expect(classifyRoute('/races')).toBe('stale-while-revalidate')
    expect(classifyRoute('/runs/tigerwolves')).toBe('stale-while-revalidate')
    expect(classifyRoute('/runs/mourning-doves')).toBe('stale-while-revalidate')
  })

  test('auth/write/api paths are network-only — never cached', () => {
    expect(classifyRoute('/schedule')).toBe('network-only')
    expect(classifyRoute('/my-plan')).toBe('network-only')
    expect(classifyRoute('/api/health')).toBe('network-only')
    expect(classifyRoute('/api/e2e-revalidate')).toBe('network-only')
  })

  test('unknown/home routes default to network-only (not cached)', () => {
    expect(classifyRoute('/')).toBe('network-only')
    expect(classifyRoute('/sign-in')).toBe('network-only')
    expect(classifyRoute('/runs')).toBe('network-only') // the index, not a slug
  })

  test('a path that merely starts with a cached-route name is not mis-cached', () => {
    expect(classifyRoute('/libraryish')).toBe('network-only')
    expect(classifyRoute('/all-runs-admin')).toBe('network-only')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/swCachePolicy.test.ts`
Expected: FAIL — `classifyRoute` not defined / module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/sw-cache-policy.ts
// #465 Story B — pure request classification for the service worker.
// Kept dependency-free and pure so the scope guard is fully unit-testable.

export type CacheStrategy = 'cache-first' | 'stale-while-revalidate' | 'network-only'

/** Exact public, read-only routes cached stale-while-revalidate. */
export const SWR_ROUTES = ['/all-runs', '/library', '/races'] as const

/** Dynamic route prefix cached per-slug, stale-while-revalidate. */
const RUNS_SLUG_PREFIX = '/runs/'

/** Path prefixes that must NEVER be cached (auth, writes, api). */
export const NETWORK_ONLY_PREFIXES = ['/schedule', '/my-plan', '/api'] as const

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + '/')
}

export function classifyRoute(pathname: string): CacheStrategy {
  // Network-only wins first — the scope guard is a denylist that outranks caching.
  if (NETWORK_ONLY_PREFIXES.some((p) => matchesPrefix(pathname, p))) {
    return 'network-only'
  }
  if ((SWR_ROUTES as readonly string[]).includes(pathname)) {
    return 'stale-while-revalidate'
  }
  // A run slug (/runs/<slug>) is cached; the bare /runs index is not.
  if (pathname.startsWith(RUNS_SLUG_PREFIX) && pathname.length > RUNS_SLUG_PREFIX.length) {
    return 'stale-while-revalidate'
  }
  // Default: do not cache unknown routes (home, sign-in, etc.).
  return 'network-only'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/swCachePolicy.test.ts`
Expected: PASS (all 4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/sw-cache-policy.ts __tests__/swCachePolicy.test.ts
git commit -m "feat(#465): pure SW cache-policy classifier with scope-guard tests"
```

---

### Task 2: Branded offline fallback page

A precached page shown when an uncached navigation fails offline. Testable online (dev-friendly) by navigating to `/offline` directly.

**Files:**
- Create: `app/offline/page.tsx`
- Create: `e2e/offline-page.spec.ts`

**Interfaces:**
- Produces: a static route at `/offline` rendering the offline message + links to the cached pages. No props, no data fetching (must render with zero network).

- [ ] **Step 1: Write the failing test**

```ts
// e2e/offline-page.spec.ts
import { test, expect } from '@playwright/test'

// #465 Story B — the branded fallback renders standalone (no network/data),
// makes clear it is THIS page that needs signal, and points at the pages that
// still work offline.
test('offline fallback page renders brand copy + cached-page links', async ({ page }) => {
  await page.goto('/offline')
  await expect(page.getByRole('heading', { name: /offline/i })).toBeVisible()
  await expect(page.getByText(/this page needs/i)).toBeVisible()
  await expect(page.getByRole('link', { name: /all runs/i })).toBeVisible()
  await expect(page.getByRole('link', { name: /library/i })).toBeVisible()
  await expect(page.getByRole('link', { name: /races/i })).toBeVisible()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test e2e/offline-page.spec.ts --project=chromium`
Expected: FAIL — `/offline` 404s (page does not exist).

- [ ] **Step 3: Write minimal implementation**

```tsx
// app/offline/page.tsx
import Link from 'next/link'

export const metadata = { title: 'Offline — TigerWolves' }

// #465 Story B — navigation fallback. Must render with ZERO network: no data
// fetch, no dynamic server work. Copy makes clear it is THIS page that needs
// signal, and lists the pages that still work offline.
export default function OfflinePage() {
  const cached = [
    { href: '/all-runs', label: 'All Runs' },
    { href: '/library', label: 'Library' },
    { href: '/races', label: 'Races' },
  ]
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <div className="text-5xl" aria-hidden>🐯🐺</div>
      <h1 className="text-2xl font-bold text-gray-900">You&apos;re offline</h1>
      <p className="text-gray-600">
        This page needs a connection. Reconnect to load it — the rest of the app you&apos;ve
        already opened still works offline.
      </p>
      <nav className="flex w-full flex-col gap-3">
        <p className="text-sm font-medium text-gray-500">These still work offline:</p>
        {cached.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="touch-manipulation rounded-lg bg-orange-500 px-4 py-3 font-semibold text-white"
          >
            {c.label}
          </Link>
        ))}
      </nav>
    </main>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test e2e/offline-page.spec.ts --project=chromium`
Expected: PASS. (Runs under local `next dev` — no SW needed.)

- [ ] **Step 5: Commit**

```bash
git add app/offline/page.tsx e2e/offline-page.spec.ts
git commit -m "feat(#465): branded offline fallback page"
```

---

### Task 3: Serwist wiring (deps, config, service worker, registration)

Install Serwist, nest it inside Sentry, author `app/sw.ts` from the Task 1 policy, and register the SW. This is the Next-16-compatibility gate.

**Files:**
- Modify: `package.json` (add `@serwist/next`, `serwist`)
- Modify: `next.config.ts`
- Create: `app/sw.ts`
- Modify: `.gitignore` (ignore generated `public/sw.js`, `public/swe-worker-*.js`)
- Modify: `tsconfig.json` (ensure `app/sw.ts` gets WebWorker lib types — via `/// <reference lib="webworker" />` in the file if tsconfig already includes `app/**`)
- Test: `__tests__/swConfig.test.ts` (assert the SW source wires the required invariants)

**Interfaces:**
- Consumes: `classifyRoute`, `SWR_ROUTES`, `NETWORK_ONLY_PREFIXES` from `lib/sw-cache-policy.ts` (Task 1).
- Produces: a registered `/sw.js` in production builds; no new exports consumed by other tasks.

- [ ] **Step 1: Install dependencies**

Run (confirm exact dev/prod split against the installed `@serwist/next` README):
```bash
npm install @serwist/next serwist
```
Expected: both resolve and install. If install or the later build reports a hard Next 16 incompatibility, **STOP and escalate to Lou** (Global Constraints).

- [ ] **Step 2: Write the failing config test**

```ts
// __tests__/swConfig.test.ts
import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// #465 Story B — guard the SW source's load-bearing invariants so a future edit
// can't silently drop silent-update or the scope guard. (Static-source assertions;
// the behavioral gate is the offline e2e in Task 4.)
describe('service worker source invariants (#465)', () => {
  const sw = readFileSync(path.resolve(__dirname, '../app/sw.ts'), 'utf8')

  test('silent auto-update is configured', () => {
    expect(sw).toMatch(/skipWaiting:\s*true/)
    expect(sw).toMatch(/clientsClaim:\s*true/)
  })

  test('offline page is the navigation fallback', () => {
    expect(sw).toContain('/offline')
  })

  test('cache policy is driven by the shared classifier, not re-hardcoded', () => {
    expect(sw).toMatch(/sw-cache-policy/)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run __tests__/swConfig.test.ts`
Expected: FAIL — `app/sw.ts` does not exist.

- [ ] **Step 4: Author `app/sw.ts`**

```ts
// app/sw.ts
/// <reference lib="webworker" />
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { CacheFirst, NetworkOnly, Serwist, StaleWhileRevalidate } from 'serwist'
import { classifyRoute } from '@/lib/sw-cache-policy'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}
declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Content-hashed build assets: cache-first (new build = new URL).
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/_next/static'),
      handler: new CacheFirst({ cacheName: 'next-static' }),
    },
    // Story A PWA icons + other same-origin static images: cache-first.
    {
      matcher: ({ request, sameOrigin }) => sameOrigin && request.destination === 'image',
      handler: new CacheFirst({ cacheName: 'images' }),
    },
    // The four public read-only routes + their RSC/data payloads: SWR.
    {
      matcher: ({ url, sameOrigin }) =>
        sameOrigin && classifyRoute(url.pathname) === 'stale-while-revalidate',
      handler: new StaleWhileRevalidate({ cacheName: 'public-pages' }),
    },
    // Auth/write/api: explicit network-only so the scope guard is visible.
    {
      matcher: ({ url, sameOrigin }) =>
        sameOrigin && classifyRoute(url.pathname) === 'network-only',
      handler: new NetworkOnly(),
    },
  ],
  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
})

serwist.addEventListeners()
```

- [ ] **Step 5: Wire `next.config.ts` (nest Serwist inside Sentry)**

```ts
// next.config.ts
import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'
import withSerwistInit from '@serwist/next'

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/my-week', destination: '/my-plan', permanent: true },
      { source: '/plan', destination: '/schedule', permanent: true },
    ]
  },
}

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  // Active only in production builds; keeps local `next dev` e2e unaffected.
  disable: process.env.NODE_ENV === 'development',
})

export default withSentryConfig(withSerwist(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  disableLogger: true,
})
```

- [ ] **Step 6: Ignore generated SW artifacts**

Add to `.gitignore`:
```
# Serwist-generated service worker (#465)
/public/sw.js
/public/swe-worker-*.js
```

- [ ] **Step 7: Run the config test to verify it passes**

Run: `npx vitest run __tests__/swConfig.test.ts`
Expected: PASS.

- [ ] **Step 8: Verify the full unit suite + typecheck still pass**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS. (If `tsc` flags `app/sw.ts` WebWorker globals, confirm the `/// <reference lib="webworker" />` is present and `app/**` is in `tsconfig.json` `include`.)

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json next.config.ts app/sw.ts .gitignore __tests__/swConfig.test.ts tsconfig.json
git commit -m "feat(#465): wire Serwist SW (SWR public routes, network-only auth, silent update)"
```

- [ ] **Step 10: Verify on Preview (the real build gate)**

Push the branch, open the PR, and on the Preview deployment confirm:
- The Vercel build **succeeds** on Next 16 (the compatibility gate). If it fails on Serwist, STOP and escalate.
- `https://<preview>/sw.js` is served (200, JS).
- In the browser console on a public route: `navigator.serviceWorker.getRegistration()` resolves to a registration.

If `@serwist/next`'s default registration does not auto-register in this Next 16 build, add a minimal client registration component (`navigator.serviceWorker.register('/sw.js')` on `window.load`) mounted in `app/layout.tsx`, and note it in the PR. Re-verify.

---

### Task 4: Offline behavior e2e (the acceptance gate)

The real proof of the story: the four routes survive going offline, uncached routes fall back, and auth/write routes are never served stale. Requires the SW, so it runs against a production build (CI) and skips under local `next dev`.

**Files:**
- Create: `e2e/offline.spec.ts`

**Interfaces:**
- Consumes: the registered SW from Task 3; the `/offline` page from Task 2.

- [ ] **Step 1: Write the offline e2e spec**

```ts
// e2e/offline.spec.ts
import { test, expect, type Page } from '@playwright/test'

// #465 Story B — offline read-only. The SW only exists in a production build
// (CI `npm run build && npm run start`); under local `next dev` it is disabled,
// so skip rather than false-fail.
async function serviceWorkerActive(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false
    const reg = await navigator.serviceWorker.getRegistration()
    return !!reg && !!navigator.serviceWorker.controller
  })
}

test.describe('offline read-only (#465)', () => {
  test('public routes survive offline; uncached + auth routes fall back', async ({ page, context }) => {
    // Prime the cache online.
    for (const route of ['/all-runs', '/library', '/races']) {
      await page.goto(route)
      await page.waitForLoadState('networkidle')
    }

    if (!(await serviceWorkerActive(page))) {
      test.skip(true, 'SW disabled (local next dev build) — verified in CI/Preview prod build')
    }

    await context.setOffline(true)

    // Cached public routes still render offline.
    await page.goto('/all-runs')
    await expect(page.getByRole('main')).toBeVisible()
    await page.goto('/library')
    await expect(page.getByRole('main')).toBeVisible()

    // Second offline load of a cached route — SWR revalidation fails silently,
    // cached copy still served, no error overlay.
    await page.goto('/races')
    await expect(page.getByRole('main')).toBeVisible()

    // A never-visited route offline → branded fallback, not a blank/stale page.
    await page.goto('/runs/this-slug-was-never-opened')
    await expect(page.getByRole('heading', { name: /offline/i })).toBeVisible()

    // An auth/write route offline → fallback, NEVER a cached authed view.
    await page.goto('/schedule')
    await expect(page.getByRole('heading', { name: /offline/i })).toBeVisible()

    await context.setOffline(false)
  })
})
```

- [ ] **Step 2: Run locally to confirm it skips cleanly under `next dev`**

Run: `npm run test:e2e -- offline.spec.ts`
Expected: SKIPPED (SW disabled in dev) — confirms no false failure. The real assertions run in CI/Preview.

- [ ] **Step 3: Commit**

```bash
git add e2e/offline.spec.ts
git commit -m "test(#465): offline e2e — cached routes survive, uncached/auth fall back"
```

- [ ] **Step 4: Verify the real offline behavior in CI / against Preview**

CI runs e2e against a production build, so `offline.spec.ts` executes for real there. Confirm it PASSES in CI. Independently sanity-check on the Preview URL with Chrome DevTools → Network → Offline: load `/all-runs`, go offline, reload → still renders; navigate to a never-visited run → branded offline page.

---

## Notes for the executor

- **Migration/DB:** none. This story touches no schema — ignore the four-branch migration dance.
- **Cache invalidation (`updateTag`):** not relevant here; the SW cache is separate from Next's data cache.
- **If Serwist's API differs** from the snippets (export names, option shapes) in the installed version, adapt to the installed version's README — the invariants that must hold regardless: SWR for the four public routes, network-only for Clerk/`/api`/`/schedule`/`/my-plan`, `skipWaiting`+`clientsClaim`, `/offline` document fallback.
- **The one hard stop:** Next 16 incompatibility. Everything else is adaptable; that one is a Lou decision.
