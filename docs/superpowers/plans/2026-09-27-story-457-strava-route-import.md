# Strava Route Import + Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a leader creates or edits a route whose map link is a Strava URL, the app fetches authoritative distance/elevation/geometry from Strava's official API, shows distance + elevation as editable fields on the existing review step, stores them on `workout_families`, and displays them on the route card.

**Architecture:** A provider layer (`lib/routeProviders/`) exposes a `RouteProvider` interface (`matches(url)` / `fetch(url)`) plus a registry; the Strava provider parses a route id from the URL and calls `GET /routes/{id}` with a server-side OAuth `read` token cached in Upstash KV and refreshed on expiry. A new `/api/route/enrich` route handler (parallel to `/api/workout/infer`, fired on step-1 submit) returns the mapped fields; the review step surfaces distance + elevation as editable inputs and stashes geometry silently. Save writes three new nullable columns on `workout_families`. Everything is additive and nullable-safe: routes without a link, or with a failed fetch, behave exactly as today.

**Tech Stack:** Next.js App Router (route handlers + Server Actions), TypeScript, zod, Neon Postgres (`@neondatabase/serverless` via `lib/db.ts`), Upstash KV (`@vercel/kv`), Sentry (`@sentry/nextjs`), vitest (node env, `@/` alias, mocked `fetch`).

**Spec:** `docs/superpowers/specs/2026-09-27-story-457-strava-route-import-design.md`

## Global Constraints

- Data lives on `workout_families`, next to `map_link` — NOT on `workout_variants`. Three new nullable columns: `distance_miles NUMERIC`, `elevation_gain_feet NUMERIC`, `geometry JSONB`.
- Migration file `scripts/migrate-457.sql` must be idempotent (`ADD COLUMN IF NOT EXISTS`) and replay-safe — no migration-tracking table exists; `scripts/run-migrate.ts` replays every `migrate-*.sql` on every merge and the demo-schema auto-sync goes red if any is not a no-op on second run.
- Apply the migration to the PR's **Preview** Neon branch AND the **test-data** branch (`br-tiny-darkness-at3q6q1y`, host `ep-fragrant-sunset`) before declaring the build done — CI unit tests run against test-data, so a Preview-only apply leaves CI red with `column … does not exist`. Production (`br-square-river-atjn0mzq`) + demo-data (`br-little-rice-at9l08ja`) are applied at/after merge (a plain migration apply is enough for demo — no `refresh-demo.ts`). Confirm columns exist by querying the target before calling a schema-migration task done.
- Strava auth is entirely server-side: `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REFRESH_TOKEN` in Vercel env. No secret is ever sent client-side or committed. The access token is cached in Upstash KV keyed with its expiry; refresh via `POST https://www.strava.com/oauth/token` only on cache miss/expiry.
- Every new route handler AND every new Server Action call site wraps its work in `try/catch` + `Sentry.captureException` (import style: `import * as Sentry from '@sentry/nextjs'`). An unguarded `await` on a Server Action trips `global-error.tsx` for the user; the fix does not travel with a copied pattern — apply it at each call site.
- Graceful fallback is mandatory: a private / unreadable / failed / non-Strava link must NEVER crash. The enrich endpoint returns a null-ish result and the review step falls back to today's manual fields; the leader saves as they do now.
- No live Strava calls in CI — every unit test mocks `fetch` (and `kv`).
- Unit conversions: distance metres → miles (`m / 1609.344`), elevation metres → feet (`m * 3.28084`). Round distance to 2 decimals, elevation to whole feet on display; store the mapped numeric value.
- Provider layer must be extensible: #458 (MapMyRun) plugs in by adding a provider to the registry without touching Strava code. The registry is the only place that knows the provider set.
- Mobile-first, non-technical users: `touch-manipulation` on interactive elements; `aria-label` on any icon-only control.

## Review Focus

These are inputs the spec implies but no single happy-path task exercises; each is pinned to a test in the owning task, most-likely-to-bite first:

1. **Two-URL cell (`URL_A OR URL_B`)** — a leader pastes a link cell holding two URLs joined by ` OR `; the app must take URL_A and parse its id. Pinned in Task 2 (Strava URL/id parsing).
2. **Long numeric route id (`3506443192297552740`)** — exceeds `Number.MAX_SAFE_INTEGER`; must be kept as a string end-to-end, never coerced to a JS number. Pinned in Task 2.
3. **Private / 401 / 404 / network-error route** — `GET /routes/{id}` fails or returns non-200; provider returns `null`, enrich returns a fallback shape, no throw. Pinned in Task 3 (provider fetch) and Task 5 (enrich endpoint).
4. **Expired-but-present KV token** — cached token exists but is past expiry; must refresh, not reuse. Cache-miss and cache-hit both covered. Pinned in Task 1 (token cache).
5. **Non-Strava / empty / malformed link** — `matches()` returns false for a MapMyRun/garbage/empty URL, the registry returns no provider, enrich returns fallback, and the existing manual review flow is untouched. Pinned in Task 4 (registry) and Task 5 (enrich endpoint).

---

## File Structure

- `scripts/migrate-457.sql` — **create** — three nullable columns on `workout_families`.
- `lib/routeProviders/types.ts` — **create** — the `RouteProvider` interface and `RouteEnrichment` result type.
- `lib/routeProviders/strava.ts` — **create** — Strava provider: URL match, id parse, `GET /routes/{id}`, response map.
- `lib/strava/token.ts` — **create** — server-side access-token acquisition with KV cache + refresh.
- `lib/routeProviders/registry.ts` — **create** — provider registry + `providerFor(url)`.
- `app/api/route/enrich/route.ts` — **create** — the enrichment route handler.
- `scripts/migrate.sql` — **modify** — add the three columns to the canonical `workout_families` DDL (kept in sync with the migration for fresh DBs).
- `lib/data.ts:11-36` — **modify** — add `distanceMiles`, `elevationGainFeet`, `geometry` to `WorkoutVariantRow`.
- `lib/db.ts:82-136` — **modify** — SELECT the three new columns in both branches of `fetchWorkoutVariants` and map them.
- `lib/db.ts:382-414` (`dbInsertWorkoutVariant`), `lib/db.ts:416-448` (`dbUpdateWorkoutVariant`) — **modify** — write the three columns to `workout_families`.
- `lib/workoutVariant.ts:6-58` — **modify** — add the three fields to `WorkoutVariantInputSchema` + `buildWorkoutVariantInput`.
- `components/AddWorkoutForm.tsx` — **modify** — call `/api/route/enrich` on step-1 submit; carry distance/elevation/geometry in state; render editable distance + elevation on review; set them in `buildFormData`.
- `components/EditWorkoutForm.tsx` — **modify** — mirror the AddWorkoutForm changes; seed state from the existing variant's stored values.
- `components/WorkoutDetails.tsx` / `components/LibraryClient.tsx` — **modify** — display distance + elevation on the route card.
- Tests: `__tests__/stravaToken.test.ts`, `__tests__/routeProviderStrava.test.ts`, `__tests__/routeProviderRegistry.test.ts`, `__tests__/routeEnrich.test.ts`, `__tests__/workoutVariantInput.test.ts` (extend or create).

## Split assessment

This plan is intended as a **single sub-200K build** — see the "Split point" note at the end for the fallback boundary if the executor judges it near the ceiling. Tasks 1–5 (token + provider + registry + enrich endpoint) are the token-infra half; Tasks 6–9 (schema + persistence + form/review + display) are the wiring half. The split point, if taken, is between Task 5 and Task 6.

---

### Task 1: Strava access-token cache + refresh (`lib/strava/token.ts`)

**Files:**
- Create: `lib/strava/token.ts`
- Test: `__tests__/stravaToken.test.ts`

**Interfaces:**
- Consumes: `kv` from `@vercel/kv` (mocked in tests), `fetch` (global, mocked in tests), env `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` / `STRAVA_REFRESH_TOKEN`.
- Produces: `getStravaAccessToken(): Promise<string>` — returns a valid access token, refreshing via Strava OAuth on KV cache miss/expiry and writing the refreshed token+expiry back to KV. Throws on refresh failure (caller wraps in try/catch + Sentry).
- Produces: exported constant `STRAVA_TOKEN_KEY = 'strava:access_token'` and `STRAVA_TOKEN_SKEW_MS = 60_000` (refresh 60s before actual expiry) for tests.

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/stravaToken.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const kvGet = vi.fn()
const kvSet = vi.fn()
vi.mock('@vercel/kv', () => ({ kv: { get: (...a: unknown[]) => kvGet(...a), set: (...a: unknown[]) => kvSet(...a) } }))

import { getStravaAccessToken, STRAVA_TOKEN_KEY } from '@/lib/strava/token'

describe('getStravaAccessToken', () => {
  beforeEach(() => {
    kvGet.mockReset(); kvSet.mockReset(); vi.unstubAllGlobals(); vi.useRealTimers()
    process.env.STRAVA_CLIENT_ID = 'cid'
    process.env.STRAVA_CLIENT_SECRET = 'secret'
    process.env.STRAVA_REFRESH_TOKEN = 'refresh'
  })

  it('returns the cached token when it is not near expiry (cache hit, no refresh)', async () => {
    kvGet.mockResolvedValue({ accessToken: 'cached-tok', expiresAt: Date.now() + 3_600_000 })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const tok = await getStravaAccessToken()
    expect(tok).toBe('cached-tok')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refreshes when the cached token is expired (or within the skew window)', async () => {
    kvGet.mockResolvedValue({ accessToken: 'old-tok', expiresAt: Date.now() + 10_000 }) // within 60s skew
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'new-tok', expires_at: Math.floor(Date.now() / 1000) + 21600 }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const tok = await getStravaAccessToken()
    expect(tok).toBe('new-tok')
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('https://www.strava.com/oauth/token')
    const body = JSON.parse((opts as RequestInit).body as string)
    expect(body).toMatchObject({ client_id: 'cid', client_secret: 'secret', grant_type: 'refresh_token', refresh_token: 'refresh' })
    // caches the refreshed token with a ms-epoch expiry derived from expires_at (seconds)
    expect(kvSet).toHaveBeenCalledWith(STRAVA_TOKEN_KEY, expect.objectContaining({ accessToken: 'new-tok' }))
  })

  it('refreshes when there is no cached token at all (cache miss)', async () => {
    kvGet.mockResolvedValue(null)
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'fresh-tok', expires_at: Math.floor(Date.now() / 1000) + 21600 }),
    })
    vi.stubGlobal('fetch', fetchMock)
    expect(await getStravaAccessToken()).toBe('fresh-tok')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('throws when the refresh call fails (non-ok)', async () => {
    kvGet.mockResolvedValue(null)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'bad' }))
    await expect(getStravaAccessToken()).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/stravaToken.test.ts`
Expected: FAIL — cannot resolve `@/lib/strava/token`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/strava/token.ts
import { kv } from '@vercel/kv'

export const STRAVA_TOKEN_KEY = 'strava:access_token'
export const STRAVA_TOKEN_SKEW_MS = 60_000

type CachedToken = { accessToken: string; expiresAt: number } // expiresAt is ms epoch

async function refresh(): Promise<CachedToken> {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: process.env.STRAVA_REFRESH_TOKEN,
    }),
  })
  if (!res.ok) throw new Error(`Strava token refresh failed: ${res.status}`)
  const data = (await res.json()) as { access_token: string; expires_at: number }
  const token: CachedToken = { accessToken: data.access_token, expiresAt: data.expires_at * 1000 }
  await kv.set(STRAVA_TOKEN_KEY, token)
  return token
}

export async function getStravaAccessToken(): Promise<string> {
  let cached: CachedToken | null = null
  try {
    cached = await kv.get<CachedToken>(STRAVA_TOKEN_KEY)
  } catch {
    cached = null // KV outage: fall through to a refresh
  }
  if (cached && cached.expiresAt - STRAVA_TOKEN_SKEW_MS > Date.now()) {
    return cached.accessToken
  }
  const refreshed = await refresh()
  return refreshed.accessToken
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/stravaToken.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/strava/token.ts __tests__/stravaToken.test.ts
git commit -m "feat(#457): server-side Strava access-token cache + refresh"
```

---

### Task 2: Strava URL detection + id parsing (`lib/routeProviders/strava.ts`, parse-only)

**Files:**
- Create: `lib/routeProviders/types.ts`
- Create: `lib/routeProviders/strava.ts` (this task adds `matches` + `parseRouteId` only; `fetch` comes in Task 3)
- Test: `__tests__/routeProviderStrava.test.ts`

**Interfaces:**
- Produces (`lib/routeProviders/types.ts`):
  ```typescript
  export type RouteEnrichment = {
    distanceMiles: number
    elevationFeet: number
    geometry: unknown            // provider-native geometry payload (Strava: { summaryPolyline: string })
    name?: string
  }
  export interface RouteProvider {
    id: string                                   // e.g. 'strava'
    matches(url: string): boolean
    fetch(url: string): Promise<RouteEnrichment | null>
  }
  ```
- Produces (`lib/routeProviders/strava.ts`): `stravaProvider: RouteProvider`; exported helper `parseStravaRouteId(url: string): string | null` (kept as a string — long ids overflow JS numbers).
- Consumes: `takeFirstUrl` (defined here or inline) that, given a cell like `URL_A OR URL_B`, returns `URL_A`.

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/routeProviderStrava.test.ts
import { describe, it, expect } from 'vitest'
import { stravaProvider, parseStravaRouteId } from '@/lib/routeProviders/strava'

describe('stravaProvider.matches', () => {
  it('matches short and long strava route URLs, with/without scheme/www', () => {
    expect(stravaProvider.matches('https://www.strava.com/routes/6647021')).toBe(true)
    expect(stravaProvider.matches('strava.com/routes/3506443192297552740')).toBe(true)
    expect(stravaProvider.matches('http://strava.com/routes/6647021?foo=bar')).toBe(true)
  })
  it('does not match non-strava, empty, or garbage links', () => {
    expect(stravaProvider.matches('https://www.mapmyrun.com/routes/123')).toBe(false)
    expect(stravaProvider.matches('')).toBe(false)
    expect(stravaProvider.matches('not a url')).toBe(false)
    expect(stravaProvider.matches('https://strava.com/athletes/999')).toBe(false) // not a route URL
  })
  it('matches when the cell holds "URL_A OR URL_B" and URL_A is strava', () => {
    expect(stravaProvider.matches('https://www.strava.com/routes/6647021 OR https://mapmyrun.com/x')).toBe(true)
  })
})

describe('parseStravaRouteId', () => {
  it('parses a short id', () => {
    expect(parseStravaRouteId('https://www.strava.com/routes/6647021')).toBe('6647021')
  })
  it('parses a long id WITHOUT coercing to a number (kept as string)', () => {
    const id = parseStravaRouteId('strava.com/routes/3506443192297552740')
    expect(id).toBe('3506443192297552740')
    expect(typeof id).toBe('string')
  })
  it('strips query params and trailing slashes', () => {
    expect(parseStravaRouteId('https://www.strava.com/routes/6647021/?utm=x')).toBe('6647021')
  })
  it('takes URL_A from a two-URL cell', () => {
    expect(parseStravaRouteId('https://www.strava.com/routes/6647021 OR https://strava.com/routes/999')).toBe('6647021')
  })
  it('returns null for a non-route or garbage input', () => {
    expect(parseStravaRouteId('https://strava.com/athletes/999')).toBeNull()
    expect(parseStravaRouteId('')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/routeProviderStrava.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation (parse layer only)**

```typescript
// lib/routeProviders/types.ts  — (as in Interfaces above)
```

```typescript
// lib/routeProviders/strava.ts
import type { RouteProvider, RouteEnrichment } from './types'

// A link cell may hold "URL_A OR URL_B" — take URL_A.
export function takeFirstUrl(raw: string): string {
  return raw.split(/\s+OR\s+/i)[0]?.trim() ?? ''
}

const ROUTE_RE = /strava\.com\/routes\/(\d+)/i

export function parseStravaRouteId(raw: string): string | null {
  const url = takeFirstUrl(raw)
  const m = url.match(ROUTE_RE)
  return m ? m[1] : null // capture group is the digit string — never Number()'d
}

export const stravaProvider: RouteProvider = {
  id: 'strava',
  matches(url: string): boolean {
    return parseStravaRouteId(url) !== null
  },
  // fetch implemented in Task 3
  async fetch(): Promise<RouteEnrichment | null> {
    throw new Error('not implemented')
  },
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/routeProviderStrava.test.ts`
Expected: PASS (matches + parse tests).

- [ ] **Step 5: Commit**

```bash
git add lib/routeProviders/types.ts lib/routeProviders/strava.ts __tests__/routeProviderStrava.test.ts
git commit -m "feat(#457): RouteProvider interface + Strava URL/id parsing"
```

---

### Task 3: Strava `fetch` — call `GET /routes/{id}` and map the response

**Files:**
- Modify: `lib/routeProviders/strava.ts` (replace the stub `fetch`)
- Test: `__tests__/routeProviderStrava.test.ts` (append `describe('stravaProvider.fetch')`)

**Interfaces:**
- Consumes: `getStravaAccessToken` from `@/lib/strava/token` (Task 1); global `fetch` (mocked).
- Produces: `stravaProvider.fetch(url)` resolves to `{ distanceMiles, elevationFeet, geometry: { summaryPolyline }, name }` on 200, or `null` on bad url / non-200 / thrown fetch.

- [ ] **Step 1: Write the failing tests (append)**

```typescript
// append to __tests__/routeProviderStrava.test.ts
import { vi, beforeEach } from 'vitest'
vi.mock('@/lib/strava/token', () => ({ getStravaAccessToken: vi.fn().mockResolvedValue('tok') }))

describe('stravaProvider.fetch', () => {
  beforeEach(() => { vi.unstubAllGlobals() })

  it('maps distance (m→mi), elevation_gain (m→ft), and summary_polyline on 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        name: 'Doves loop',
        distance: 16093.44,       // 10.0 mi
        elevation_gain: 100,      // 328.084 ft
        map: { summary_polyline: 'abc_polyline' },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const r = await stravaProvider.fetch('https://www.strava.com/routes/6647021')
    expect(r).not.toBeNull()
    expect(r!.distanceMiles).toBeCloseTo(10.0, 2)
    expect(r!.elevationFeet).toBeCloseTo(328.084, 1)
    expect(r!.geometry).toEqual({ summaryPolyline: 'abc_polyline' })
    expect(r!.name).toBe('Doves loop')
    // called the routes endpoint with the parsed id and a Bearer token
    const [reqUrl, opts] = fetchMock.mock.calls[0]
    expect(reqUrl).toBe('https://www.strava.com/api/v3/routes/6647021')
    expect((opts as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok' })
  })

  it('returns null when the id cannot be parsed', async () => {
    expect(await stravaProvider.fetch('https://strava.com/athletes/1')).toBeNull()
  })

  it('returns null on a non-200 (private/404/401) response — no throw', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    expect(await stravaProvider.fetch('https://www.strava.com/routes/6647021')).toBeNull()
  })

  it('returns null when fetch itself throws (network error) — no throw', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    expect(await stravaProvider.fetch('https://www.strava.com/routes/6647021')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/routeProviderStrava.test.ts`
Expected: FAIL — `fetch` still throws `not implemented`.

- [ ] **Step 3: Implement `fetch`**

```typescript
// lib/routeProviders/strava.ts — replace the stub fetch
import { getStravaAccessToken } from '@/lib/strava/token'

const METERS_PER_MILE = 1609.344
const FEET_PER_METER = 3.28084

// ...inside stravaProvider:
  async fetch(rawUrl: string): Promise<RouteEnrichment | null> {
    const id = parseStravaRouteId(rawUrl)
    if (!id) return null
    try {
      const token = await getStravaAccessToken()
      const res = await fetch(`https://www.strava.com/api/v3/routes/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return null
      const data = (await res.json()) as {
        name?: string
        distance?: number
        elevation_gain?: number
        map?: { summary_polyline?: string }
      }
      const distance = data.distance ?? 0
      const elevation = data.elevation_gain ?? 0
      return {
        distanceMiles: distance / METERS_PER_MILE,
        elevationFeet: elevation * FEET_PER_METER,
        geometry: { summaryPolyline: data.map?.summary_polyline ?? '' },
        name: data.name,
      }
    } catch {
      return null // network / parse failure → graceful fallback
    }
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/routeProviderStrava.test.ts`
Expected: PASS (all Strava tests).

- [ ] **Step 5: Commit**

```bash
git add lib/routeProviders/strava.ts __tests__/routeProviderStrava.test.ts
git commit -m "feat(#457): Strava provider fetch — GET /routes/{id} + response mapping"
```

---

### Task 4: Provider registry (`lib/routeProviders/registry.ts`)

**Files:**
- Create: `lib/routeProviders/registry.ts`
- Test: `__tests__/routeProviderRegistry.test.ts`

**Interfaces:**
- Consumes: `stravaProvider` from `./strava`, `RouteProvider` from `./types`.
- Produces: `PROVIDERS: RouteProvider[]` and `providerFor(url: string): RouteProvider | null` — returns the first provider whose `matches` is true, or `null`. This is the ONLY place the provider set is enumerated; #458 adds MapMyRun here.

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/routeProviderRegistry.test.ts
import { describe, it, expect } from 'vitest'
import { providerFor, PROVIDERS } from '@/lib/routeProviders/registry'

describe('providerFor', () => {
  it('returns the strava provider for a strava route URL', () => {
    expect(providerFor('https://www.strava.com/routes/6647021')?.id).toBe('strava')
  })
  it('returns null for a non-matching / empty / garbage URL', () => {
    expect(providerFor('https://www.mapmyrun.com/routes/1')).toBeNull()
    expect(providerFor('')).toBeNull()
    expect(providerFor('nonsense')).toBeNull()
  })
  it('exposes a non-empty provider array so #458 can extend it', () => {
    expect(PROVIDERS.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/routeProviderRegistry.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement the registry**

```typescript
// lib/routeProviders/registry.ts
import type { RouteProvider } from './types'
import { stravaProvider } from './strava'

// The single place the provider set is enumerated. #458 adds mapMyRunProvider here.
export const PROVIDERS: RouteProvider[] = [stravaProvider]

export function providerFor(url: string): RouteProvider | null {
  if (!url) return null
  return PROVIDERS.find(p => p.matches(url)) ?? null
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/routeProviderRegistry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/routeProviders/registry.ts __tests__/routeProviderRegistry.test.ts
git commit -m "feat(#457): route-provider registry (extensible for #458)"
```

---

### Task 5: Enrichment route handler (`app/api/route/enrich/route.ts`)

**Files:**
- Create: `app/api/route/enrich/route.ts`
- Test: `__tests__/routeEnrich.test.ts`

**Interfaces:**
- Consumes: `providerFor` from `@/lib/routeProviders/registry`; `currentUser` from `@clerk/nextjs/server` (leader-gated, mirroring `/api/workout/infer`); `Sentry` from `@sentry/nextjs`.
- Produces: `POST` handler. Request body `{ url: string }`. Response JSON `RouteEnrichResult`:
  ```typescript
  type RouteEnrichResult =
    | { enriched: true; provider: string; distanceMiles: number; elevationFeet: number; geometry: unknown; name?: string }
    | { enriched: false }   // no provider matched, fetch returned null, or an error occurred
  ```
  A failed enrichment is `200 { enriched: false }`, NOT an error status — the client treats it as "fall back to manual fields," and a non-ok would look like a bug.

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/routeEnrich.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const currentUser = vi.fn()
vi.mock('@clerk/nextjs/server', () => ({ currentUser: () => currentUser() }))
const providerFor = vi.fn()
vi.mock('@/lib/routeProviders/registry', () => ({ providerFor: (u: string) => providerFor(u) }))
const captureException = vi.fn()
vi.mock('@sentry/nextjs', () => ({ captureException: (...a: unknown[]) => captureException(...a) }))

import { POST } from '@/app/api/route/enrich/route'

function req(body: unknown) {
  return new Request('http://localhost/api/route/enrich', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}

describe('POST /api/route/enrich', () => {
  beforeEach(() => { currentUser.mockReset(); providerFor.mockReset(); captureException.mockReset() })

  it('401s a non-leader', async () => {
    currentUser.mockResolvedValue({ publicMetadata: { role: 'runner' } })
    const res = await POST(req({ url: 'https://www.strava.com/routes/1' }))
    expect(res.status).toBe(401)
  })

  it('returns enriched fields when a provider matches and fetch succeeds', async () => {
    currentUser.mockResolvedValue({ publicMetadata: { role: 'leader' } })
    providerFor.mockReturnValue({ id: 'strava', fetch: vi.fn().mockResolvedValue({ distanceMiles: 10, elevationFeet: 328, geometry: { summaryPolyline: 'p' }, name: 'Loop' }) })
    const res = await POST(req({ url: 'https://www.strava.com/routes/6647021' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ enriched: true, provider: 'strava', distanceMiles: 10, elevationFeet: 328, geometry: { summaryPolyline: 'p' }, name: 'Loop' })
  })

  it('returns { enriched: false } (200) when no provider matches', async () => {
    currentUser.mockResolvedValue({ publicMetadata: { role: 'leader' } })
    providerFor.mockReturnValue(null)
    const res = await POST(req({ url: 'https://mapmyrun.com/x' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ enriched: false })
  })

  it('returns { enriched: false } (200) when the provider fetch returns null (private/failed)', async () => {
    currentUser.mockResolvedValue({ publicMetadata: { role: 'leader' } })
    providerFor.mockReturnValue({ id: 'strava', fetch: vi.fn().mockResolvedValue(null) })
    const res = await POST(req({ url: 'https://www.strava.com/routes/6647021' }))
    expect(await res.json()).toEqual({ enriched: false })
  })

  it('captures to Sentry and returns { enriched: false } when the provider throws', async () => {
    currentUser.mockResolvedValue({ publicMetadata: { role: 'leader' } })
    providerFor.mockReturnValue({ id: 'strava', fetch: vi.fn().mockRejectedValue(new Error('boom')) })
    const res = await POST(req({ url: 'https://www.strava.com/routes/6647021' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ enriched: false })
    expect(captureException).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/routeEnrich.test.ts`
Expected: FAIL — cannot resolve `@/app/api/route/enrich/route`.

- [ ] **Step 3: Implement the route handler**

```typescript
// app/api/route/enrich/route.ts
import { currentUser } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { providerFor } from '@/lib/routeProviders/registry'

export async function POST(req: Request) {
  const user = await currentUser()
  if (!user || user.publicMetadata?.role !== 'leader') return new Response('Unauthorized', { status: 401 })

  try {
    const { url } = (await req.json()) as { url?: string }
    const provider = url ? providerFor(url) : null
    if (!provider) return NextResponse.json({ enriched: false })

    const result = await provider.fetch(url!)
    if (!result) return NextResponse.json({ enriched: false })

    return NextResponse.json({
      enriched: true,
      provider: provider.id,
      distanceMiles: result.distanceMiles,
      elevationFeet: result.elevationFeet,
      geometry: result.geometry,
      name: result.name,
    })
  } catch (err) {
    Sentry.captureException(err)
    return NextResponse.json({ enriched: false })
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/routeEnrich.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/route/enrich/route.ts __tests__/routeEnrich.test.ts
git commit -m "feat(#457): /api/route/enrich handler — leader-gated, Sentry-guarded, graceful fallback"
```

> **SPLIT POINT** — if the executor judges the build near ~200K tokens, stop here and re-PUBLISH Tasks 6–9 as a follow-up sub-story. Tasks 1–5 ship cleanly on their own: nothing calls the endpoint yet, no schema change, so `main` is unaffected.

---

### Task 6: Migration — three nullable columns on `workout_families`

**Files:**
- Create: `scripts/migrate-457.sql`
- Modify: `scripts/migrate.sql:75-85` (canonical `workout_families` DDL, for fresh DBs)

**Interfaces:**
- Produces: columns `workout_families.distance_miles NUMERIC`, `elevation_gain_feet NUMERIC`, `geometry JSONB` (all nullable) available to later tasks' SQL.

- [ ] **Step 1: Write the migration**

```sql
-- scripts/migrate-457.sql
-- #457: authoritative route metrics fetched from the map link's provider (Strava).
-- All nullable + additive: routes without a link, or with a failed fetch, stay NULL and
-- behave exactly as before. ADD COLUMN IF NOT EXISTS makes the whole file replay-safe
-- (run-migrate.ts replays every migrate-*.sql on each merge; a second run is a no-op).
ALTER TABLE workout_families ADD COLUMN IF NOT EXISTS distance_miles      NUMERIC;
ALTER TABLE workout_families ADD COLUMN IF NOT EXISTS elevation_gain_feet NUMERIC;
ALTER TABLE workout_families ADD COLUMN IF NOT EXISTS geometry            JSONB;
```

- [ ] **Step 2: Mirror the columns in the canonical DDL**

In `scripts/migrate.sql`, inside `CREATE TABLE IF NOT EXISTS workout_families (...)` (after `map_link TEXT,`), add:

```sql
  distance_miles      NUMERIC,          -- #457: authoritative distance (miles) from the map-link provider
  elevation_gain_feet NUMERIC,          -- #457: authoritative elevation gain (feet)
  geometry            JSONB,            -- #457: provider-native route geometry (Strava: { summaryPolyline })
```

- [ ] **Step 3: Apply to Preview + test-data and verify**

Fetch the Preview branch connection string via the Neon REST API (project `purple-star-02119717`, this PR's `preview/<branch>` branch) and the test-data branch (`br-tiny-darkness-at3q6q1y`), then apply `scripts/migrate-457.sql` to each. Verify with:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'workout_families'
  AND column_name IN ('distance_miles', 'elevation_gain_feet', 'geometry');
```
Expected: three rows on BOTH branches. (Do not declare this task done on a "migration not yet run" note — query the target.)

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-457.sql scripts/migrate.sql
git commit -m "feat(#457): migration — nullable distance/elevation/geometry on workout_families"
```

---

### Task 7: Persistence — schema type, write path, read path

**Files:**
- Modify: `lib/data.ts:11-36` (`WorkoutVariantRow`)
- Modify: `lib/workoutVariant.ts:6-58` (`WorkoutVariantInputSchema` + `buildWorkoutVariantInput`)
- Modify: `lib/db.ts:82-108` (both `fetchWorkoutVariants` SELECTs + `82-108` map), `lib/db.ts:385-389` (`dbInsertWorkoutVariant`), `lib/db.ts:421-432` (`dbUpdateWorkoutVariant`)
- Test: `__tests__/workoutVariantInput.test.ts`

**Interfaces:**
- Consumes: form fields `distanceMiles`, `elevationGainFeet`, `geometry` (JSON string) from `FormData` (produced by Task 8's forms).
- Produces: `WorkoutVariantInput` gains `distanceMiles: number | null`, `elevationGainFeet: number | null`, `geometry: unknown | null`; `WorkoutVariantRow` gains the same three fields; the write functions persist them; `fetchWorkoutVariants` returns them.

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/workoutVariantInput.test.ts  (create if absent, else append)
import { describe, it, expect } from 'vitest'
import { buildWorkoutVariantInput } from '@/lib/workoutVariant'

function fd(entries: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.set(k, v)
  return f
}

const base = {
  name: 'X', category: 'Quality', type: 'Threshold', reason: '', instructions: 'WU',
  distTime: '', energySystem: '', hrZone: '', rpe: '', raceTypes: '', trainingPhases: '',
  hasTurnaround: 'false', turnaround: '',
}

describe('buildWorkoutVariantInput — route metrics (#457)', () => {
  it('parses numeric distance/elevation and JSON geometry', () => {
    const input = buildWorkoutVariantInput(fd({
      ...base, distanceMiles: '10.24', elevationGainFeet: '328', geometry: JSON.stringify({ summaryPolyline: 'p' }),
    }))
    expect(input.distanceMiles).toBe(10.24)
    expect(input.elevationGainFeet).toBe(328)
    expect(input.geometry).toEqual({ summaryPolyline: 'p' })
  })
  it('defaults all three to null when absent or blank', () => {
    const input = buildWorkoutVariantInput(fd({ ...base }))
    expect(input.distanceMiles).toBeNull()
    expect(input.elevationGainFeet).toBeNull()
    expect(input.geometry).toBeNull()
  })
  it('treats a non-numeric distance as null (leader cleared the field)', () => {
    const input = buildWorkoutVariantInput(fd({ ...base, distanceMiles: '' }))
    expect(input.distanceMiles).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/workoutVariantInput.test.ts`
Expected: FAIL — fields not on the parsed object.

- [ ] **Step 3: Extend the schema + builder**

In `lib/workoutVariant.ts`, add to `WorkoutVariantInputSchema`:

```typescript
  distanceMiles: z.number().nullable(),
  elevationGainFeet: z.number().nullable(),
  geometry: z.unknown().nullable(),
```

and in `buildWorkoutVariantInput`, before the closing `})`:

```typescript
  const distanceRaw = formData.get('distanceMiles') as string
  const elevationRaw = formData.get('elevationGainFeet') as string
  const geometryRaw = formData.get('geometry') as string
  // ...inside the parse object:
    distanceMiles: distanceRaw && !Number.isNaN(Number(distanceRaw)) ? Number(distanceRaw) : null,
    elevationGainFeet: elevationRaw && !Number.isNaN(Number(elevationRaw)) ? Number(elevationRaw) : null,
    geometry: geometryRaw ? JSON.parse(geometryRaw) : null,
```

- [ ] **Step 4: Extend `WorkoutVariantRow`, the SELECTs, and the write path**

In `lib/data.ts` `WorkoutVariantRow`, add:

```typescript
  distanceMiles: number | null
  elevationGainFeet: number | null
  geometry: unknown | null
```

In `lib/db.ts`, in BOTH `fetchWorkoutVariants` SELECT lists add `wf.distance_miles, wf.elevation_gain_feet, wf.geometry,` and in the `.map(...)`:

```typescript
    distanceMiles: r.distance_miles != null ? Number(r.distance_miles) : null,
    elevationGainFeet: r.elevation_gain_feet != null ? Number(r.elevation_gain_feet) : null,
    geometry: (r.geometry as unknown) ?? null,
```

In `dbInsertWorkoutVariant`, extend the INSERT column list and VALUES:

```typescript
    INSERT INTO workout_families (name, category, type, reason, author, coaching_notes, map_link, run_group_id, distance_miles, elevation_gain_feet, geometry)
    VALUES (${w.name}, ${w.category}, ${w.type}, ${w.reason}, ${w.author}, ${w.coachingNotes}, ${w.mapLink}, ${w.runGroupId}, ${w.distanceMiles}, ${w.elevationGainFeet}, ${JSON.stringify(w.geometry) ?? null})
```

In `dbUpdateWorkoutVariant`, add to the `workout_families` UPDATE SET:

```typescript
      distance_miles = ${w.distanceMiles},
      elevation_gain_feet = ${w.elevationGainFeet},
      geometry = ${JSON.stringify(w.geometry) ?? null},
```

> Note: `JSON.stringify(null)` is `"null"` (a string), so guard: pass `w.geometry == null ? null : JSON.stringify(w.geometry)`. Use that exact expression in both writes.

- [ ] **Step 5: Run the input tests + the existing db/type suite to verify green**

Run: `npx vitest run __tests__/workoutVariantInput.test.ts` — Expected: PASS.
Run: `npx tsc --noEmit` — Expected: no errors (every construction of `WorkoutVariantInput`/`WorkoutVariantRow` now type-checks with the three new fields; if the compiler flags a literal that omits them, add the null defaults there).

- [ ] **Step 6: Commit**

```bash
git add lib/data.ts lib/workoutVariant.ts lib/db.ts __tests__/workoutVariantInput.test.ts
git commit -m "feat(#457): persist + read distance/elevation/geometry on workout_families"
```

---

### Task 8: Forms — enrich on step-1 submit, editable distance/elevation on review

**Files:**
- Modify: `components/AddWorkoutForm.tsx`
- Modify: `components/EditWorkoutForm.tsx`
- Test: (component behavior verified on Preview — see AC; unit coverage of the pure pieces already lives in Tasks 2/3/5/7. No new unit test file — these are `'use client'` components with no extracted pure logic worth a node-env test.)

**Interfaces:**
- Consumes: `POST /api/route/enrich` (Task 5) returning `RouteEnrichResult`; `buildWorkoutVariantInput` form keys `distanceMiles` / `elevationGainFeet` / `geometry` (Task 7).
- Produces: `FormData` with those three keys populated (or omitted → null) at save.

- [ ] **Step 1: Add route-metric state to AddWorkoutForm**

Add to the component state (near `review`):

```typescript
  const [distanceMiles, setDistanceMiles] = useState<string>('')      // editable string in the input
  const [elevationFeet, setElevationFeet] = useState<string>('')
  const [geometry, setGeometry] = useState<unknown | null>(null)      // silent
```

- [ ] **Step 2: Fire the enrich call in parallel with inference on step-1 submit**

In `handleEntry`, after the existing `/api/workout/infer` call resolves and before `setStep('review')`, fire enrichment in parallel (independent failure — a route failure must not block inference):

```typescript
      // #457: enrich the route from its provider (Strava) in parallel; failure is silent.
      if (entry.route.trim()) {
        try {
          const enrichRes = await fetch('/api/route/enrich', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: entry.route }),
          })
          if (enrichRes.ok) {
            const data = await enrichRes.json()
            if (data.enriched) {
              setDistanceMiles(data.distanceMiles.toFixed(2))
              setElevationFeet(String(Math.round(data.elevationFeet)))
              setGeometry(data.geometry ?? null)
            }
          }
        } catch { /* graceful fallback — leave manual fields blank */ }
      }
```

> Structure this so the two `fetch`es run concurrently (kick off both promises, then `await` both) rather than strictly serially — the spec calls for a parallel fetch. A `Promise.all([inferPromise, enrichPromise])` around the two blocks is acceptable as long as an enrich rejection cannot reject the infer path.

- [ ] **Step 3: Render editable distance + elevation on the review step**

Add these Fields on the review screen, immediately after the existing `Distance / Time` field:

```tsx
        <Field label="Distance (mi)">
          <input value={distanceMiles} onChange={e => setDistanceMiles(e.target.value)}
            inputMode="decimal"
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:border-orange-400"
            placeholder="Auto-filled from the route link, or enter manually" />
        </Field>

        <Field label="Elevation gain (ft)">
          <input value={elevationFeet} onChange={e => setElevationFeet(e.target.value)}
            inputMode="numeric"
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:border-orange-400"
            placeholder="Auto-filled from the route link, or enter manually" />
        </Field>
```

- [ ] **Step 4: Include the three fields in `buildFormData`**

Add to `buildFormData`:

```typescript
    formData.set('distanceMiles', distanceMiles)
    formData.set('elevationGainFeet', elevationFeet)
    formData.set('geometry', geometry != null ? JSON.stringify(geometry) : '')
```

- [ ] **Step 5: Mirror all four steps in EditWorkoutForm**

Seed initial state from the existing variant so an edit keeps stored values when the leader doesn't re-fetch:

```typescript
  const [distanceMiles, setDistanceMiles] = useState<string>(variant.distanceMiles != null ? variant.distanceMiles.toFixed(2) : '')
  const [elevationFeet, setElevationFeet] = useState<string>(variant.elevationGainFeet != null ? String(Math.round(variant.elevationGainFeet)) : '')
  const [geometry, setGeometry] = useState<unknown | null>(variant.geometry ?? null)
```

Then repeat Steps 2–4 verbatim in `EditWorkoutForm` (the enrich call, the two review Fields, and the `buildFormData` additions).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add components/AddWorkoutForm.tsx components/EditWorkoutForm.tsx
git commit -m "feat(#457): forms enrich route on submit; editable distance/elevation on review"
```

---

### Task 9: Display distance + elevation on the route card

**Files:**
- Modify: `components/WorkoutDetails.tsx`
- Modify: `components/LibraryClient.tsx:186-192` (the inline `distTime` / `lastRan` row)
- Test: (visual — verified on Preview per AC; the read shape is unit-covered in Task 7)

**Interfaces:**
- Consumes: `WorkoutVariantRow.distanceMiles` / `.elevationGainFeet` (Task 7).
- Produces: distance + elevation rendered on the Library/Schedule route card.

- [ ] **Step 1: Show metrics in the LibraryClient inline row**

In `components/LibraryClient.tsx`, in the inline `flex gap-3 text-xs text-gray-400` block (the one with `w.distTime` and `w.lastRan`), add a distance/elevation span before `w.distTime`:

```tsx
          {w.distanceMiles != null && <span>{w.distanceMiles.toFixed(1)} mi</span>}
          {w.elevationGainFeet != null && <span>{Math.round(w.elevationGainFeet)} ft ↑</span>}
```

Keep the existing `·` separators consistent (add a separator between the new spans and `distTime`/`lastRan` following the existing conditional-dot pattern so there is never a leading/trailing dot).

- [ ] **Step 2: Show metrics in WorkoutDetails (expanded view)**

In `components/WorkoutDetails.tsx`, add to `hasContent` the two new fields, and render a `DetailRow` for each near the top of the details block:

```tsx
      {w.distanceMiles != null && <DetailRow label="Distance" value={`${w.distanceMiles.toFixed(2)} mi`} />}
      {w.elevationGainFeet != null && <DetailRow label="Elevation gain" value={`${Math.round(w.elevationGainFeet)} ft`} />}
```

Add `w.distanceMiles != null || w.elevationGainFeet != null` into the `hasContent` OR-chain so a route with only metrics still renders.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/WorkoutDetails.tsx components/LibraryClient.tsx
git commit -m "feat(#457): show route distance + elevation on the card"
```

---

### Task 10: Full-suite verification + Preview manual pass

**Files:** none (verification only)

- [ ] **Step 1: Run the whole unit suite**

Run: `npx vitest run`
Expected: PASS (all existing + the five new files). Investigate any red before proceeding.

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 3: Confirm the migration reached Preview + test-data (re-verify)**

Re-run the `information_schema.columns` query from Task 6 Step 3 against both branches. Expected: three rows each.

- [ ] **Step 4: Preview manual pass (Lou, on the PR URL — record as PR checkboxes)**

- Create a route with a real public Strava link → review shows auto-filled Distance + Elevation → save → card shows them (AC 1, 2).
- Edit that route → stored distance/elevation prefill the review inputs (AC 1).
- Create a route with a private/garbage Strava link → review shows blank manual Distance/Elevation fields, no crash, save works with a manual distance (AC 3).
- Create a route with a MapMyRun link → no crash, manual fields, save works (AC 3, 4-stub).

- [ ] **Step 5: No commit** (verification task).

---

## Self-Review notes

- **Spec coverage:** AC1 → Tasks 5/8; AC2 → Tasks 7/9; AC3 → Tasks 3/5/8 (graceful fallback at every layer); AC4 → Tasks 2/4 (interface + registry, MapMyRun-ready); AC5 → Task 1 (server-side env creds + refresh, no client secret); AC6 → Tasks 6/10 (idempotent migration applied to Preview + test-data, verified by query); AC7 → Tasks 1/2/3/5/7 (URL detection, short+long+two-URL id parse, response map, token refresh).
- **Provider extensibility (#458):** the registry (Task 4) is the sole enumeration point; a MapMyRun provider implementing `RouteProvider` plugs in there without touching `strava.ts`.
- **Sentry guardrail:** the new route handler (Task 5) is Sentry-guarded; the new form call sites (Task 8) fail silently by design (a route-enrich failure is expected, not exceptional) — the existing `addWorkout`/`updateWorkout` Server Actions are already guarded upstream and their behavior is unchanged. Confirm during review that no new unguarded `await` on a Server Action was introduced.
- **Long-id safety:** route ids stay strings the whole way (Task 2 test pins it); never `Number()`'d.
- **Geometry null-vs-"null":** Task 7 Step 4 note guards `JSON.stringify(null)` producing the string `"null"`.

## Split call

**Recommendation: single sub-200K build.** The nine implementation tasks are mostly small and additive; the heaviest is the token infra (Task 1) but it is self-contained. Fits one build. If the executor's running token count approaches ~200K by the end of Task 5, take the pre-marked split: ship Tasks 1–5 (token + provider + registry + enrich endpoint — inert, nothing calls it, no schema change, safe on `main`) and re-PUBLISH Tasks 6–9 (schema + persistence + form/review + display) as a follow-up sub-story. The plan is written so that boundary is clean.
