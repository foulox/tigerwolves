# Landmark Route Directions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate an editable, read-aloud "landmark" route narrative for a routed run from its imported GPS trace, confirmed by the leader at the create/edit step, stored, and available in the run detail and as a Heylo merge field.

**Architecture:** A new leader-gated endpoint `POST /api/route/directions` runs the spike-proven pipeline: full GPS trace → Mapbox Map Matching (ordered streets) + Mapbox Tilequery (candidate landmarks) → Claude composes the narrative constrained to those names. The result is stored in a new nullable `workout_families.route_narrative` column, threaded through the existing `WorkoutVariantRow` path (DB → forms → `WorkoutDetails` → `postBuilder`), following the exact pattern #457/#459 built for distance/elevation/geometry/image.

**Tech Stack:** Next.js (App Router), TypeScript, Neon Postgres, `@anthropic-ai/sdk`, Mapbox Map Matching + Tilequery REST APIs, vitest (node env).

**Spec:** `docs/superpowers/specs/2026-09-28-story-460-landmark-route-directions-design.md`

## Global Constraints

- Migration is additive, nullable, and replay-safe: `ADD COLUMN IF NOT EXISTS route_narrative TEXT`. Must stay idempotent (no migration-tracking table exists).
- LLM model is `claude-sonnet-4-6` (matches `/api/workout/infer`); reuse the ambient `ANTHROPIC_API_KEY` (no key argument).
- Mapbox calls read a new server-side env var `MAPBOX_TOKEN`. Add it to Vercel Preview + Production.
- Both new/existing route endpoints are leader-gated: `currentUser()` must have `publicMetadata.role === 'leader'`, else `401`.
- The `route_narrative` merge field is **opt-in**: add it to `POST_FIELDS`, but **do not** add `{{route_narrative}}` to `defaultTemplate`.
- New API route wraps its body in `try/catch` with `Sentry.captureException(err)` and returns a graceful empty result on failure (mirror `/api/route/enrich`).
- Generation never blocks the save: any failure yields a `null` narrative and the run still saves.
- 4-branch migration rule: apply `scripts/migrate-460.sql` to the PR's **Preview** and **test-data** (`ep-fragrant-sunset`) branches before declaring the build done; **production** (`ep-super-waterfall`) and **demo-data** (`ep-ancient-math`) at/after merge.
- Accessibility: the icon-or-text "Regenerate" control gets an `aria-label`; interactive elements get `touch-manipulation`.
- Coordinate order: Mapbox APIs take `lng,lat`; internal `LatLng` is `[lat, lng]`. Convert only at the Mapbox call sites.

## Review Focus

- **Edit with a changed map URL** → narrative regenerates; unchanged URL → stored text (incl. hand-edits) kept verbatim. Pinned in Task 10 (`shouldGenerateDirections`).
- **Route link removed on edit** → `route_narrative` cleared, not left stale. Pinned in Task 10 (`shouldGenerateDirections` returns false + form clears state).
- **Unsupported link / no geometry / pipeline failure** → endpoint returns `{ narrative: null }`, save still succeeds. Pinned in Task 7 (endpoint test) + Task 1 (nullable column).
- **Trace longer than Mapbox's 100-coordinate cap** → chunked with overlap, no segment dropped. Pinned in Task 3 (`chunkPoints`).
- **Strava's coarse stored `summary_polyline` must NOT be the match input** → the full `streams` `latlng` trace is fetched instead. Pinned in Task 6 (`fetchStravaLatLng`).

---

### Task 1: Data model — `route_narrative` column + persistence round-trip

**Files:**
- Create: `scripts/migrate-460.sql`
- Modify: `lib/data.ts` (the `WorkoutVariantRow` type — add near `mapImageUrl`)
- Modify: `lib/db.ts` (two SELECT column lists; the row mapper ~`mapImageUrl:`; the INSERT column list + VALUES; the UPDATE set-list)
- Modify: `lib/workoutVariant.ts` (zod schema ~line 41; `buildFormData` parse ~line 93)
- Modify: `lib/schema-semantics.yml` (add a `route_narrative` entry near `map_image_url`)
- Test: `__tests__/db.test.ts`

**Interfaces:**
- Produces: `WorkoutVariantRow.routeNarrative: string | null`; DB column `workout_families.route_narrative TEXT`; form field key `routeNarrative`.

- [ ] **Step 1: Write the migration**

`scripts/migrate-460.sql`:
```sql
-- scripts/migrate-460.sql
-- #460: leader-confirmed landmark route narrative, generated from the route trace.
-- Additive + nullable + replay-safe. NULL when the route has no link, isn't
-- Strava/MapMyRun, yielded no geometry, or generation failed.
ALTER TABLE workout_families ADD COLUMN IF NOT EXISTS route_narrative TEXT;
```

- [ ] **Step 2: Apply the migration to the test-data branch**

Run (test-data host `ep-fragrant-sunset`; connection string via Neon REST per CLAUDE.md, branch `br-tiny-darkness-at3q6q1y`):
```bash
DATABASE_URL='<test-data-branch-conn>' MIGRATE_ONLY_HOST=ep-fragrant-sunset npx tsx scripts/run-migrate.ts
```
Expected: completes; re-running is a no-op (idempotent).

- [ ] **Step 3: Write the failing round-trip test**

Add to `__tests__/db.test.ts` (follow the existing insert/read pattern in that file; use its existing helpers/fixtures):
```ts
it('round-trips route_narrative on a workout family', async () => {
  const created = await createWorkoutFamilyFixture({ routeNarrative: 'Out of McCarren down Kent to the waterfront.' })
  const row = await readWorkoutVariantRow(created.id)
  expect(row.routeNarrative).toBe('Out of McCarren down Kent to the waterfront.')
})

it('defaults route_narrative to null when unset', async () => {
  const created = await createWorkoutFamilyFixture({})
  const row = await readWorkoutVariantRow(created.id)
  expect(row.routeNarrative).toBeNull()
})
```
(Use the names the existing tests use for creating a family and reading a row; if the file lacks such helpers, insert via the same `addWorkout`/`db` path the neighboring tests use and pass `routeNarrative` through `buildFormData`.)

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run __tests__/db.test.ts -t route_narrative`
Expected: FAIL — `routeNarrative` is `undefined`/column missing.

- [ ] **Step 5: Thread `route_narrative` through the type, DB layer, and form parser**

`lib/data.ts` — in `WorkoutVariantRow`, next to `mapImageUrl: string | null`:
```ts
  routeNarrative: string | null
```

`lib/db.ts`:
- Both SELECT column lists that currently end `…, wf.geometry, wf.map_image_url,` → append `wf.route_narrative,`.
- Row mapper, next to `mapImageUrl: (r.map_image_url as string | null) ?? null,`:
```ts
    routeNarrative: (r.route_narrative as string | null) ?? null,
```
- INSERT column list `(…, geometry, map_image_url)` → `(…, geometry, map_image_url, route_narrative)`; VALUES `…, ${w.mapImageUrl})` → `…, ${w.mapImageUrl}, ${w.routeNarrative})`.
- UPDATE set-list, next to `map_image_url = ${w.mapImageUrl}` → add `, route_narrative = ${w.routeNarrative}`.

`lib/workoutVariant.ts`:
- zod schema, next to `mapImageUrl: z.string().nullable(),`:
```ts
  routeNarrative: z.string().nullable(),
```
- `buildFormData` parse, next to `mapImageUrl: (formData.get('mapImageUrl') as string) || null,`:
```ts
    routeNarrative: (formData.get('routeNarrative') as string) || null,
```

`lib/schema-semantics.yml` — add near `map_image_url`:
```yaml
    route_narrative:
      description: Leader-confirmed landmark route narrative (#460), generated from the route trace. NULL when none.
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run __tests__/db.test.ts -t route_narrative`
Expected: PASS.

- [ ] **Step 7: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.
```bash
git add scripts/migrate-460.sql lib/data.ts lib/db.ts lib/workoutVariant.ts lib/schema-semantics.yml __tests__/db.test.ts
git commit -m "#460: add route_narrative column + persistence round-trip"
```

---

### Task 2: `analyzeShape` + `metersBetween` (route geometry helpers)

**Files:**
- Create: `lib/routeDirections/geo.ts`
- Create: `lib/routeDirections/shape.ts`
- Create: `lib/routeDirections/types.ts`
- Test: `__tests__/routeDirections/shape.test.ts`

**Interfaces:**
- Produces:
  - `type LatLng = [number, number]` (lat, lng) — in `types.ts`
  - `type RouteShape = { returnsToStart: boolean; startToEndMeters: number }` — in `types.ts`
  - `metersBetween(a: LatLng, b: LatLng): number` — in `geo.ts`
  - `analyzeShape(points: LatLng[]): RouteShape` — in `shape.ts`

- [ ] **Step 1: Write the types**

`lib/routeDirections/types.ts`:
```ts
export type LatLng = [number, number] // [lat, lng]

export type RouteShape = { returnsToStart: boolean; startToEndMeters: number }

export type LandmarkCandidate = { name: string; anchor: 'start' | 'turnaround' | 'end'; distanceMeters: number }

export type DirectionsInput = {
  routeName: string | null
  distanceMiles: number | null
  streets: string[]
  shape: RouteShape
  landmarks: LandmarkCandidate[]
}
```

- [ ] **Step 2: Write the failing test**

`__tests__/routeDirections/shape.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { metersBetween } from '@/lib/routeDirections/geo'
import { analyzeShape } from '@/lib/routeDirections/shape'
import type { LatLng } from '@/lib/routeDirections/types'

describe('metersBetween', () => {
  it('is ~0 for identical points', () => {
    expect(metersBetween([40.72, -73.95], [40.72, -73.95])).toBeCloseTo(0, 1)
  })
  it('measures a short city hop within ~10% of a known distance', () => {
    // ~157m north
    const d = metersBetween([40.7200, -73.9500], [40.7214, -73.9500])
    expect(d).toBeGreaterThan(140)
    expect(d).toBeLessThan(175)
  })
})

describe('analyzeShape', () => {
  it('flags a loop/out-and-back that ends near its start', () => {
    const pts: LatLng[] = [[40.7200, -73.9500], [40.7300, -73.9600], [40.7201, -73.9501]]
    const s = analyzeShape(pts)
    expect(s.returnsToStart).toBe(true)
    expect(s.startToEndMeters).toBeLessThan(200)
  })
  it('flags a point-to-point that ends far from its start', () => {
    const pts: LatLng[] = [[40.7208, -73.9510], [40.7100, -73.9700], [40.7040, -73.9920]]
    const s = analyzeShape(pts)
    expect(s.returnsToStart).toBe(false)
    expect(s.startToEndMeters).toBeGreaterThan(200)
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run __tests__/routeDirections/shape.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement**

`lib/routeDirections/geo.ts`:
```ts
import type { LatLng } from './types'

// Equirectangular approximation — accurate to well within 1% at city scale,
// which is all this needs (anchor selection + start/end proximity).
export function metersBetween(a: LatLng, b: LatLng): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const x = toRad(b[1] - a[1]) * Math.cos(toRad((a[0] + b[0]) / 2))
  const y = toRad(b[0] - a[0])
  return Math.sqrt(x * x + y * y) * R
}
```

`lib/routeDirections/shape.ts`:
```ts
import type { LatLng, RouteShape } from './types'
import { metersBetween } from './geo'

const RETURN_THRESHOLD_M = 200

export function analyzeShape(points: LatLng[]): RouteShape {
  if (points.length < 2) return { returnsToStart: true, startToEndMeters: 0 }
  const startToEndMeters = metersBetween(points[0], points[points.length - 1])
  return { returnsToStart: startToEndMeters <= RETURN_THRESHOLD_M, startToEndMeters }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run __tests__/routeDirections/shape.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/routeDirections/types.ts lib/routeDirections/geo.ts lib/routeDirections/shape.ts __tests__/routeDirections/shape.test.ts
git commit -m "#460: route geometry helpers (metersBetween, analyzeShape)"
```

---

### Task 3: `mapMatch` — chunking, Mapbox Map Matching, street stitching

**Files:**
- Create: `lib/routeDirections/mapMatch.ts`
- Test: `__tests__/routeDirections/mapMatch.test.ts`

**Interfaces:**
- Consumes: `LatLng` (Task 2).
- Produces:
  - `chunkPoints(points: LatLng[], size?: number, overlap?: number): LatLng[][]`
  - `stitchStreets(stepNames: string[]): string[]`
  - `mapMatch(points: LatLng[], token: string, fetchImpl?: typeof fetch): Promise<string[]>`

- [ ] **Step 1: Write the failing test**

`__tests__/routeDirections/mapMatch.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { chunkPoints, stitchStreets, mapMatch } from '@/lib/routeDirections/mapMatch'
import type { LatLng } from '@/lib/routeDirections/types'

describe('chunkPoints', () => {
  it('splits >100-point traces into <=size chunks with overlap and no gaps', () => {
    const pts: LatLng[] = Array.from({ length: 243 }, (_, i) => [40 + i / 1e4, -73])
    const chunks = chunkPoints(pts, 95, 1)
    expect(chunks.length).toBe(3)
    expect(Math.max(...chunks.map(c => c.length))).toBeLessThanOrEqual(95)
    // overlap: last point of chunk N equals first point of chunk N+1
    expect(chunks[0][chunks[0].length - 1]).toEqual(chunks[1][0])
    expect(chunks.every(c => c.length >= 2)).toBe(true)
  })
})

describe('stitchStreets', () => {
  it('drops empties and collapses consecutive duplicates, preserving revisits', () => {
    const raw = ['', 'North 12th Street', '', 'Kent Avenue', 'Kent Avenue', 'Flushing Avenue', '', 'Kent Avenue']
    expect(stitchStreets(raw)).toEqual(['North 12th Street', 'Kent Avenue', 'Flushing Avenue', 'Kent Avenue'])
  })
})

describe('mapMatch', () => {
  it('chunks, calls Mapbox per chunk, and returns stitched street names', async () => {
    const pts: LatLng[] = Array.from({ length: 96 }, (_, i) => [40 + i / 1e4, -73])
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 'Ok', matchings: [{ legs: [{ steps: [{ name: 'Kent Avenue' }, { name: '' }, { name: 'Flushing Avenue' }] }] }] }),
    }) as unknown as typeof fetch
    const streets = await mapMatch(pts, 'pk.test', fetchImpl)
    expect(fetchImpl).toHaveBeenCalledTimes(2) // 96 pts, size 95, overlap 1 -> 2 chunks
    const url = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toContain('/matching/v5/mapbox/walking/')
    expect(url).toContain('access_token=pk.test')
    expect(streets).toEqual(['Kent Avenue', 'Flushing Avenue'])
  })

  it('skips a chunk that returns a non-Ok match without throwing', async () => {
    const pts: LatLng[] = Array.from({ length: 10 }, (_, i) => [40 + i / 1e4, -73])
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ code: 'NoMatch' }) }) as unknown as typeof fetch
    await expect(mapMatch(pts, 'pk.test', fetchImpl)).resolves.toEqual([])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run __tests__/routeDirections/mapMatch.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`lib/routeDirections/mapMatch.ts`:
```ts
import type { LatLng } from './types'

const MAPBOX_MAX_COORDS = 100

export function chunkPoints(points: LatLng[], size = 95, overlap = 1): LatLng[][] {
  if (points.length <= size) return points.length >= 2 ? [points] : []
  const step = size - overlap
  const chunks: LatLng[][] = []
  for (let i = 0; i < points.length - 1; i += step) {
    const chunk = points.slice(i, i + size)
    if (chunk.length >= 2) chunks.push(chunk)
    if (i + size >= points.length) break
  }
  return chunks
}

export function stitchStreets(stepNames: string[]): string[] {
  const out: string[] = []
  for (const raw of stepNames) {
    const name = (raw ?? '').trim()
    if (!name) continue
    if (out[out.length - 1] !== name) out.push(name)
  }
  return out
}

async function matchChunk(chunk: LatLng[], token: string, fetchImpl: typeof fetch): Promise<string[]> {
  const coords = chunk.map(([lat, lng]) => `${lng},${lat}`).join(';')
  const radiuses = chunk.map(() => '25').join(';')
  const qs = new URLSearchParams({ geometries: 'geojson', steps: 'true', overview: 'full', tidy: 'true', radiuses, access_token: token })
  const url = `https://api.mapbox.com/matching/v5/mapbox/walking/${coords}?${qs.toString()}`
  try {
    const res = await fetchImpl(url)
    if (!res.ok) return []
    const data = (await res.json()) as { code?: string; matchings?: { legs?: { steps?: { name?: string }[] }[] }[] }
    if (data.code !== 'Ok' || !data.matchings) return []
    const names: string[] = []
    for (const m of data.matchings) for (const leg of m.legs ?? []) for (const s of leg.steps ?? []) names.push(s.name ?? '')
    return names
  } catch {
    return []
  }
}

// Map-match a full GPS trace to ordered street names. If the map token is
// missing, or every chunk fails, returns []. MAPBOX_MAX_COORDS documents the cap
// that MAPBOX chunk size (95) stays under.
export async function mapMatch(points: LatLng[], token: string, fetchImpl: typeof fetch = fetch): Promise<string[]> {
  if (!token || points.length < 2) return []
  void MAPBOX_MAX_COORDS
  const chunks = chunkPoints(points)
  const all: string[] = []
  for (const chunk of chunks) all.push(...(await matchChunk(chunk, token, fetchImpl)))
  return stitchStreets(all)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/routeDirections/mapMatch.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/routeDirections/mapMatch.ts __tests__/routeDirections/mapMatch.test.ts
git commit -m "#460: Mapbox map-matching (chunk, match, stitch streets)"
```

---

### Task 4: `landmarks` — anchor selection + Mapbox Tilequery candidates

**Files:**
- Create: `lib/routeDirections/landmarks.ts`
- Test: `__tests__/routeDirections/landmarks.test.ts`

**Interfaces:**
- Consumes: `LatLng`, `LandmarkCandidate`, `metersBetween`.
- Produces:
  - `anchorPoints(points: LatLng[]): { start: LatLng; turnaround: LatLng; end: LatLng }`
  - `rankCandidates(features: TilequeryFeature[], anchor: LandmarkCandidate['anchor']): LandmarkCandidate[]`
  - `landmarks(points: LatLng[], token: string, fetchImpl?: typeof fetch): Promise<LandmarkCandidate[]>`
  - `type TilequeryFeature = { properties: { name?: string; tilequery?: { distance?: number } } }`

- [ ] **Step 1: Write the failing test**

`__tests__/routeDirections/landmarks.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { anchorPoints, rankCandidates, landmarks } from '@/lib/routeDirections/landmarks'
import type { LatLng } from '@/lib/routeDirections/types'

describe('anchorPoints', () => {
  it('returns first, last, and the farthest-from-start point', () => {
    const pts: LatLng[] = [[40.7208, -73.9510], [40.7040, -73.9920], [40.7261, -73.9522]]
    const a = anchorPoints(pts)
    expect(a.start).toEqual([40.7208, -73.9510])
    expect(a.end).toEqual([40.7261, -73.9522])
    expect(a.turnaround).toEqual([40.7040, -73.9920]) // farthest from start
  })
})

describe('rankCandidates', () => {
  it('dedupes by name, sorts by distance, caps, and tags the anchor', () => {
    const feats = [
      { properties: { name: 'Tom Stofka Garden', tilequery: { distance: 45 } } },
      { properties: { name: 'McCarren Park', tilequery: { distance: 30 } } },
      { properties: { name: 'McCarren Park', tilequery: { distance: 90 } } },
      { properties: { tilequery: { distance: 5 } } }, // unnamed -> dropped
    ]
    const ranked = rankCandidates(feats, 'start')
    expect(ranked.map(r => r.name)).toEqual(['McCarren Park', 'Tom Stofka Garden'])
    expect(ranked[0]).toEqual({ name: 'McCarren Park', anchor: 'start', distanceMeters: 30 })
  })
})

describe('landmarks', () => {
  it('queries each anchor and returns tagged candidates', async () => {
    const pts: LatLng[] = [[40.7208, -73.9510], [40.7040, -73.9920], [40.7261, -73.9522]]
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [{ properties: { name: 'Jane’s Carousel', tilequery: { distance: 26 } } }] }),
    }) as unknown as typeof fetch
    const out = await landmarks(pts, 'pk.test', fetchImpl)
    expect(fetchImpl).toHaveBeenCalledTimes(3) // start, turnaround, end
    const url = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toContain('/v4/mapbox.mapbox-streets-v8/tilequery/')
    expect(out.some(c => c.name === 'Jane’s Carousel')).toBe(true)
    expect(new Set(out.map(c => c.anchor))).toEqual(new Set(['start', 'turnaround', 'end']))
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run __tests__/routeDirections/landmarks.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`lib/routeDirections/landmarks.ts`:
```ts
import type { LatLng, LandmarkCandidate } from './types'
import { metersBetween } from './geo'

export type TilequeryFeature = { properties: { name?: string; tilequery?: { distance?: number } } }

const MAX_PER_ANCHOR = 4

export function anchorPoints(points: LatLng[]): { start: LatLng; turnaround: LatLng; end: LatLng } {
  const start = points[0]
  const end = points[points.length - 1]
  let turnaround = start
  let best = -1
  for (const p of points) {
    const d = metersBetween(start, p)
    if (d > best) { best = d; turnaround = p }
  }
  return { start, turnaround, end }
}

export function rankCandidates(features: TilequeryFeature[], anchor: LandmarkCandidate['anchor']): LandmarkCandidate[] {
  const byName = new Map<string, number>()
  for (const f of features) {
    const name = f.properties.name?.trim()
    if (!name) continue
    const d = f.properties.tilequery?.distance ?? Number.MAX_SAFE_INTEGER
    if (!byName.has(name) || d < byName.get(name)!) byName.set(name, d)
  }
  return [...byName.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, MAX_PER_ANCHOR)
    .map(([name, distanceMeters]) => ({ name, anchor, distanceMeters: Math.round(distanceMeters) }))
}

async function queryAnchor(p: LatLng, anchor: LandmarkCandidate['anchor'], token: string, fetchImpl: typeof fetch): Promise<LandmarkCandidate[]> {
  const [lat, lng] = p
  const url = `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/tilequery/${lng},${lat}.json?radius=250&limit=25&access_token=${token}`
  try {
    const res = await fetchImpl(url)
    if (!res.ok) return []
    const data = (await res.json()) as { features?: TilequeryFeature[] }
    return rankCandidates(data.features ?? [], anchor)
  } catch {
    return []
  }
}

export async function landmarks(points: LatLng[], token: string, fetchImpl: typeof fetch = fetch): Promise<LandmarkCandidate[]> {
  if (!token || points.length < 2) return []
  const a = anchorPoints(points)
  const [start, turn, end] = await Promise.all([
    queryAnchor(a.start, 'start', token, fetchImpl),
    queryAnchor(a.turnaround, 'turnaround', token, fetchImpl),
    queryAnchor(a.end, 'end', token, fetchImpl),
  ])
  return [...start, ...turn, ...end]
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/routeDirections/landmarks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/routeDirections/landmarks.ts __tests__/routeDirections/landmarks.test.ts
git commit -m "#460: landmark candidates via Mapbox Tilequery (anchors + ranking)"
```

---

### Task 5: `buildDirectionsPrompt` + `composeNarrative`

**Files:**
- Create: `lib/routeDirections/prompt.ts`
- Create: `lib/routeDirections/narrative.ts`
- Test: `__tests__/routeDirections/prompt.test.ts`

**Interfaces:**
- Consumes: `DirectionsInput` (Task 2).
- Produces:
  - `buildDirectionsPrompt(input: DirectionsInput): string`
  - `composeNarrative(input: DirectionsInput): Promise<string>`

- [ ] **Step 1: Write the failing test (prompt is pure — the LLM call is not unit-tested)**

`__tests__/routeDirections/prompt.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildDirectionsPrompt } from '@/lib/routeDirections/prompt'
import type { DirectionsInput } from '@/lib/routeDirections/types'

const input: DirectionsInput = {
  routeName: 'DOVES Carousel',
  distanceMiles: 8.56,
  streets: ['North 12th Street', 'Kent Avenue', 'Flushing Avenue', 'Plymouth Street'],
  shape: { returnsToStart: true, startToEndMeters: 20 },
  landmarks: [
    { name: 'McCarren Park', anchor: 'start', distanceMeters: 30 },
    { name: 'Jane’s Carousel', anchor: 'turnaround', distanceMeters: 26 },
  ],
}

describe('buildDirectionsPrompt', () => {
  it('includes the streets, landmarks, and shape', () => {
    const p = buildDirectionsPrompt(input)
    expect(p).toContain('Kent Avenue')
    expect(p).toContain('McCarren Park')
    expect(p).toContain('turnaround')
    expect(p).toContain('DOVES Carousel')
  })
  it('instructs the model not to invent street or landmark names', () => {
    const p = buildDirectionsPrompt(input).toLowerCase()
    expect(p).toMatch(/only.*(streets|landmarks|names).*(provided|listed|given)|do not (invent|make up|add)/)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run __tests__/routeDirections/prompt.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`lib/routeDirections/prompt.ts`:
```ts
import type { DirectionsInput } from './types'

export function buildDirectionsPrompt(input: DirectionsInput): string {
  const shape = input.shape.returnsToStart
    ? 'returns to its start (a loop or out-and-back)'
    : 'point-to-point (ends away from the start)'
  return [
    'You are writing a short, read-aloud route description for a running-club leader to say to their group.',
    'Compose ONE concise paragraph (2-4 sentences), plain spoken tone.',
    '',
    'STRICT RULES:',
    '- Use ONLY the street names and landmark names provided below. Do NOT invent, guess, or add any names not in these lists.',
    '- The streets are given in the exact order they occur along the route. If a street reappears in reverse, phrase it as heading back "the same way".',
    '- Mention the start and turnaround landmarks where natural. Skip landmarks that do not help.',
    '- Do not give compass bearings or "in X feet" instructions. This is a landmark description, not turn-by-turn.',
    '',
    `Route name: ${input.routeName ?? '(unnamed)'}`,
    input.distanceMiles != null ? `Distance: ${input.distanceMiles.toFixed(1)} miles` : 'Distance: unknown',
    `Shape: ${shape}`,
    '',
    'Streets in order:',
    ...input.streets.map((s, i) => `  ${i + 1}. ${s}`),
    '',
    'Landmarks (name @ anchor):',
    ...input.landmarks.map(l => `  - ${l.name} @ ${l.anchor}`),
    '',
    'Return only the paragraph, no preamble.',
  ].join('\n')
}
```
`lib/routeDirections/narrative.ts`:
```ts
import Anthropic from '@anthropic-ai/sdk'
import type { DirectionsInput } from './types'
import { buildDirectionsPrompt } from './prompt'

const client = new Anthropic()

export async function composeNarrative(input: DirectionsInput): Promise<string> {
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    messages: [{ role: 'user', content: buildDirectionsPrompt(input) }],
  })
  return message.content[0].type === 'text' ? message.content[0].text.trim() : ''
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/routeDirections/prompt.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.
```bash
git add lib/routeDirections/prompt.ts lib/routeDirections/narrative.ts __tests__/routeDirections/prompt.test.ts
git commit -m "#460: directions prompt + Claude composition"
```

---

### Task 6: Full-trace sourcing per provider

**Files:**
- Modify: `lib/routeProviders/strava.ts` (add `fetchStravaLatLng`)
- Modify: `lib/routeProviders/mapmyrun.ts` (add `fetchMapMyRunLatLng`)
- Create: `lib/routeDirections/trace.ts` (dispatch by URL)
- Test: `__tests__/routeDirections/trace.test.ts`

**Interfaces:**
- Consumes: `LatLng`; existing `getStravaAccessToken`, `parseStravaRouteId`, `parseMapMyRunRouteId`, `extractState`.
- Produces:
  - `fetchStravaLatLng(id: string, fetchImpl?: typeof fetch): Promise<LatLng[]>` (strava.ts)
  - `fetchMapMyRunLatLng(id: string, fetchImpl?: typeof fetch): Promise<LatLng[]>` (mapmyrun.ts)
  - `fetchFullTrace(url: string, fetchImpl?: typeof fetch): Promise<LatLng[]>` (trace.ts)

- [ ] **Step 1: Write the failing test**

`__tests__/routeDirections/trace.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/strava/token', () => ({ getStravaAccessToken: vi.fn().mockResolvedValue('tok') }))

import { fetchStravaLatLng } from '@/lib/routeProviders/strava'
import { fetchMapMyRunLatLng } from '@/lib/routeProviders/mapmyrun'
import { fetchFullTrace } from '@/lib/routeDirections/trace'

describe('fetchStravaLatLng', () => {
  it('reads the latlng stream (full trace, not the coarse summary)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ([{ type: 'latlng', data: [[40.72, -73.95], [40.73, -73.96]] }]),
    }) as unknown as typeof fetch
    const pts = await fetchStravaLatLng('6647021', fetchImpl)
    expect(pts).toEqual([[40.72, -73.95], [40.73, -73.96]])
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('/routes/6647021/streams')
  })
  it('returns [] on a non-200', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch
    expect(await fetchStravaLatLng('1', fetchImpl)).toEqual([])
  })
})

describe('fetchMapMyRunLatLng', () => {
  it('extracts [lat,lng] from the embedded route points', async () => {
    const html = 'x window.__STATE__ = {"routes":{"route":{"points":[{"lat":40.72,"lng":-73.95},{"lat":40.73,"lng":-73.96}]}}} ;'
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, text: async () => html }) as unknown as typeof fetch
    const pts = await fetchMapMyRunLatLng('6167055370', fetchImpl)
    expect(pts).toEqual([[40.72, -73.95], [40.73, -73.96]])
  })
})

describe('fetchFullTrace', () => {
  beforeEach(() => vi.clearAllMocks())
  it('returns [] for an unsupported url', async () => {
    expect(await fetchFullTrace('https://example.com/x')).toEqual([])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run __tests__/routeDirections/trace.test.ts`
Expected: FAIL — functions not defined.

- [ ] **Step 3: Implement**

In `lib/routeProviders/strava.ts` (reuse the module's `UA`, `parseStravaRouteId`, `getStravaAccessToken`):
```ts
import type { LatLng } from '@/lib/routeDirections/types'

// #460: the full GPS trace for map-matching. The stored summary_polyline is too
// coarse (~30 pts); the streams endpoint returns the full latlng series.
export async function fetchStravaLatLng(id: string, fetchImpl: typeof fetch = fetch): Promise<LatLng[]> {
  try {
    const token = await getStravaAccessToken()
    const res = await fetchImpl(`https://www.strava.com/api/v3/routes/${id}/streams`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return []
    const streams = (await res.json()) as { type?: string; data?: [number, number][] }[]
    const latlng = Array.isArray(streams) ? streams.find(s => s.type === 'latlng')?.data : undefined
    return Array.isArray(latlng) ? latlng.map(([lat, lng]) => [lat, lng] as LatLng) : []
  } catch {
    return []
  }
}
```

In `lib/routeProviders/mapmyrun.ts` (reuse `UA`, `parseMapMyRunRouteId`, `extractState`):
```ts
import type { LatLng } from '@/lib/routeDirections/types'

// #460: full trace already lives in the embedded route state (no extra API).
export async function fetchMapMyRunLatLng(id: string, fetchImpl: typeof fetch = fetch): Promise<LatLng[]> {
  try {
    const res = await fetchImpl(`https://www.mapmyrun.com/routes/view/${id}/`, { headers: { 'User-Agent': UA } })
    if (!res.ok) return []
    const state = extractState(await res.text()) as { routes?: { route?: { points?: { lat?: number; lng?: number }[] } } } | null
    const points = state?.routes?.route?.points
    if (!Array.isArray(points)) return []
    return points
      .filter(p => typeof p.lat === 'number' && typeof p.lng === 'number')
      .map(p => [p.lat as number, p.lng as number] as LatLng)
  } catch {
    return []
  }
}
```

`lib/routeDirections/trace.ts`:
```ts
import type { LatLng } from './types'
import { parseStravaRouteId, fetchStravaLatLng } from '@/lib/routeProviders/strava'
import { parseMapMyRunRouteId, fetchMapMyRunLatLng } from '@/lib/routeProviders/mapmyrun'

export async function fetchFullTrace(url: string, fetchImpl: typeof fetch = fetch): Promise<LatLng[]> {
  const stravaId = parseStravaRouteId(url)
  if (stravaId) return fetchStravaLatLng(stravaId, fetchImpl)
  const mmrId = parseMapMyRunRouteId(url)
  if (mmrId) return fetchMapMyRunLatLng(mmrId, fetchImpl)
  return []
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/routeDirections/trace.test.ts`
Expected: PASS. Also run the existing provider tests to confirm no regression: `npx vitest run __tests__/routeProviderStrava.test.ts __tests__/routeProviderMapMyRun.test.ts`.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.
```bash
git add lib/routeProviders/strava.ts lib/routeProviders/mapmyrun.ts lib/routeDirections/trace.ts __tests__/routeDirections/trace.test.ts
git commit -m "#460: full-trace sourcing (Strava streams, MapMyRun points, dispatch)"
```

---

### Task 7: `generateNarrative` orchestrator + `POST /api/route/directions`

**Files:**
- Create: `lib/routeDirections/index.ts` (orchestrator)
- Create: `app/api/route/directions/route.ts`
- Test: `__tests__/routeDirections/generate.test.ts`
- Test: `__tests__/routeDirectionsApi.test.ts`

**Interfaces:**
- Consumes: `fetchFullTrace`, `mapMatch`, `landmarks`, `analyzeShape`, `composeNarrative`.
- Produces:
  - `generateNarrative(args: { url: string; routeName?: string | null; distanceMiles?: number | null }, deps?: Partial<GenerateDeps>): Promise<string | null>`
  - `POST(req: Request): Promise<Response>` returning `{ narrative: string | null }`

- [ ] **Step 1: Write the failing orchestrator test (deps injected — no network)**

`__tests__/routeDirections/generate.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { generateNarrative } from '@/lib/routeDirections'
import type { LatLng } from '@/lib/routeDirections/types'

const trace: LatLng[] = [[40.72, -73.95], [40.70, -73.99], [40.72, -73.95]]

it('returns null when there is no trace', async () => {
  const out = await generateNarrative({ url: 'https://x' }, { fetchFullTrace: async () => [] })
  expect(out).toBeNull()
})

it('returns null when no streets match', async () => {
  const out = await generateNarrative({ url: 'https://x' }, {
    fetchFullTrace: async () => trace, mapMatch: async () => [], landmarks: async () => [], composeNarrative: async () => 'x',
  })
  expect(out).toBeNull()
})

it('composes a narrative from streets + landmarks', async () => {
  const compose = vi.fn().mockResolvedValue('Out of McCarren down Kent...')
  const out = await generateNarrative({ url: 'https://x', routeName: 'DOVES', distanceMiles: 8.5 }, {
    fetchFullTrace: async () => trace,
    mapMatch: async () => ['Kent Avenue', 'Flushing Avenue'],
    landmarks: async () => [{ name: 'McCarren Park', anchor: 'start', distanceMeters: 30 }],
    composeNarrative: compose,
  })
  expect(out).toBe('Out of McCarren down Kent...')
  expect(compose.mock.calls[0][0].streets).toEqual(['Kent Avenue', 'Flushing Avenue'])
  expect(compose.mock.calls[0][0].shape.returnsToStart).toBe(true)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run __tests__/routeDirections/generate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the orchestrator**

`lib/routeDirections/index.ts`:
```ts
import type { LatLng, DirectionsInput } from './types'
import { fetchFullTrace as realFetchFullTrace } from './trace'
import { mapMatch as realMapMatch } from './mapMatch'
import { landmarks as realLandmarks } from './landmarks'
import { analyzeShape } from './shape'
import { composeNarrative as realCompose } from './narrative'

export type GenerateDeps = {
  fetchFullTrace: (url: string) => Promise<LatLng[]>
  mapMatch: (points: LatLng[], token: string) => Promise<string[]>
  landmarks: (points: LatLng[], token: string) => Promise<DirectionsInput['landmarks']>
  composeNarrative: (input: DirectionsInput) => Promise<string>
}

export async function generateNarrative(
  args: { url: string; routeName?: string | null; distanceMiles?: number | null },
  deps: Partial<GenerateDeps> = {},
): Promise<string | null> {
  const token = process.env.MAPBOX_TOKEN ?? ''
  const fetchFullTrace = deps.fetchFullTrace ?? realFetchFullTrace
  const mapMatch = deps.mapMatch ?? ((p: LatLng[]) => realMapMatch(p, token))
  const landmarks = deps.landmarks ?? ((p: LatLng[]) => realLandmarks(p, token))
  const composeNarrative = deps.composeNarrative ?? realCompose

  const trace = await fetchFullTrace(args.url)
  if (trace.length < 2) return null

  const [streets, marks] = await Promise.all([mapMatch(trace, token), landmarks(trace, token)])
  if (streets.length === 0) return null

  const input: DirectionsInput = {
    routeName: args.routeName ?? null,
    distanceMiles: args.distanceMiles ?? null,
    streets,
    shape: analyzeShape(trace),
    landmarks: marks,
  }
  const narrative = await composeNarrative(input)
  return narrative.trim() || null
}
```
(Note: the injected `mapMatch`/`landmarks` in the test ignore the token arg — that's fine; the real ones close over `token`.)

- [ ] **Step 4: Run the orchestrator test to verify it passes**

Run: `npx vitest run __tests__/routeDirections/generate.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing endpoint test**

`__tests__/routeDirectionsApi.test.ts` (mirror `__tests__/routeEnrich.test.ts`):
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const currentUser = vi.fn()
vi.mock('@clerk/nextjs/server', () => ({ currentUser: () => currentUser() }))
const generateNarrative = vi.fn()
vi.mock('@/lib/routeDirections', () => ({ generateNarrative: (...a: unknown[]) => generateNarrative(...a) }))
const captureException = vi.fn()
vi.mock('@sentry/nextjs', () => ({ captureException: (...a: unknown[]) => captureException(...a) }))

import { POST } from '@/app/api/route/directions/route'

function req(body: unknown) {
  return new Request('http://localhost/api/route/directions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}

describe('POST /api/route/directions', () => {
  beforeEach(() => { currentUser.mockReset(); generateNarrative.mockReset(); captureException.mockReset() })

  it('401s a non-leader', async () => {
    currentUser.mockResolvedValue({ publicMetadata: { role: 'runner' } })
    expect((await POST(req({ url: 'https://www.strava.com/routes/1' }))).status).toBe(401)
  })

  it('returns the generated narrative for a leader', async () => {
    currentUser.mockResolvedValue({ publicMetadata: { role: 'leader' } })
    generateNarrative.mockResolvedValue('Out of McCarren down Kent...')
    const res = await POST(req({ url: 'https://www.strava.com/routes/1', name: 'DOVES', distanceMiles: 8.5 }))
    expect(await res.json()).toEqual({ narrative: 'Out of McCarren down Kent...' })
  })

  it('returns { narrative: null } when generation yields nothing, without throwing', async () => {
    currentUser.mockResolvedValue({ publicMetadata: { role: 'leader' } })
    generateNarrative.mockResolvedValue(null)
    expect(await (await POST(req({ url: 'https://example.com/x' }))).json()).toEqual({ narrative: null })
  })

  it('captures and swallows a pipeline error', async () => {
    currentUser.mockResolvedValue({ publicMetadata: { role: 'leader' } })
    generateNarrative.mockRejectedValue(new Error('boom'))
    const res = await POST(req({ url: 'https://x' }))
    expect(await res.json()).toEqual({ narrative: null })
    expect(captureException).toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run __tests__/routeDirectionsApi.test.ts`
Expected: FAIL — route module not found.

- [ ] **Step 7: Implement the endpoint**

`app/api/route/directions/route.ts`:
```ts
import { currentUser } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { generateNarrative } from '@/lib/routeDirections'

export async function POST(req: Request) {
  const user = await currentUser()
  if (!user || user.publicMetadata?.role !== 'leader') return new Response('Unauthorized', { status: 401 })

  try {
    const { url, name, distanceMiles } = (await req.json()) as { url?: string; name?: string | null; distanceMiles?: number | null }
    if (!url || !url.trim()) return NextResponse.json({ narrative: null })
    const narrative = await generateNarrative({ url, routeName: name ?? null, distanceMiles: distanceMiles ?? null })
    return NextResponse.json({ narrative: narrative ?? null })
  } catch (err) {
    Sentry.captureException(err)
    return NextResponse.json({ narrative: null })
  }
}
```

- [ ] **Step 8: Run both tests to verify they pass**

Run: `npx vitest run __tests__/routeDirections/generate.test.ts __tests__/routeDirectionsApi.test.ts`
Expected: PASS.

- [ ] **Step 9: Apply the migration to the PR's Preview branch, typecheck, commit**

Apply `migrate-460.sql` to the Preview Neon branch (fetch its connection string via Neon REST for `preview/<branch>`):
```bash
DATABASE_URL='<preview-branch-conn>' npx tsx scripts/run-migrate.ts
```
Run: `npx tsc --noEmit` → clean.
```bash
git add lib/routeDirections/index.ts app/api/route/directions/route.ts __tests__/routeDirections/generate.test.ts __tests__/routeDirectionsApi.test.ts
git commit -m "#460: directions orchestrator + /api/route/directions endpoint"
```

---

### Task 8: `{{route_narrative}}` Heylo merge field

**Files:**
- Modify: `lib/postBuilder.ts` (`POST_FIELDS` array; `resolveField` switch — leave `defaultTemplate` untouched)
- Test: `__tests__/postBuilder.test.ts` (create if absent; else extend)

**Interfaces:**
- Consumes: `WorkoutVariantRow.routeNarrative` (Task 1); `renderPostTemplate` (existing).
- Produces: a valid `{{route_narrative}}` token (chip validity + insert menu update automatically via `POST_FIELDS`).

- [ ] **Step 1: Write the failing test**

Add to `__tests__/postBuilder.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { renderPostTemplate } from '@/lib/postBuilder'
// Reuse whatever entry/runConfig/roster fixtures the existing postBuilder tests use.

describe('route_narrative merge field', () => {
  it('renders the stored narrative for {{route_narrative}}', () => {
    const selection = makeVariantRow({ routeNarrative: 'Out of McCarren down Kent to the waterfront.' })
    const out = renderPostTemplate('{{route_narrative}}', entryFixture, [selection], runConfigFixture, [])
    expect(out).toContain('Out of McCarren down Kent to the waterfront.')
  })
  it('renders empty when no narrative is set', () => {
    const selection = makeVariantRow({ routeNarrative: null })
    const out = renderPostTemplate('{{route_narrative}}', entryFixture, [selection], runConfigFixture, [])
    expect(out.trim()).toBe('')
  })
})
```
(If `__tests__/postBuilder.test.ts` doesn't exist, create it and build the minimal `entryFixture`/`runConfigFixture`/`makeVariantRow` fixtures from the `ScheduleEntry`/`RunConfig`/`WorkoutVariantRow` types in `lib/data.ts`, setting only the fields `resolveField` reads.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run __tests__/postBuilder.test.ts -t route_narrative`
Expected: FAIL — token resolves to empty for both cases (unknown key stays literal or blank).

- [ ] **Step 3: Implement**

`lib/postBuilder.ts` — add to `POST_FIELDS` (after `route_link`):
```ts
  { key: 'route_narrative', label: 'Route directions', source: 'record', affix: '' },
```
In `resolveField`, add a case before `default:`:
```ts
    case 'route_narrative':
      return primary?.routeNarrative ?? ''
```
Do **not** add `{{route_narrative}}` to `defaultTemplate` (opt-in per the spec).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/postBuilder.test.ts -t route_narrative`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/postBuilder.ts __tests__/postBuilder.test.ts
git commit -m "#460: {{route_narrative}} Heylo merge field (opt-in)"
```

---

### Task 9: Display the narrative in `WorkoutDetails`

**Files:**
- Modify: `components/WorkoutDetails.tsx`

**Interfaces:**
- Consumes: `WorkoutVariantRow.routeNarrative` (Task 1); the existing `showMap` exclude flag.

- [ ] **Step 1: Add the narrative to the content guard**

In `hasContent`, add alongside the map conditions:
```ts
    (showMap && w.routeNarrative) ||
```

- [ ] **Step 2: Render the narrative block**

Immediately before the `{showMap && w.mapImageUrl && (` block, add:
```tsx
      {showMap && w.routeNarrative && (
        <div>
          <div className="font-semibold text-gray-700 mb-1">Route directions</div>
          <p className="text-gray-600 whitespace-pre-line">{w.routeNarrative}</p>
        </div>
      )}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Manual verification on Preview (node-env vitest can't render components)**

On the PR Preview URL, open a run whose route has a narrative → the "Route directions" block shows in the expanded detail (Run page + expanded Schedule/My Plan card). Confirm the Library still shows no route info (it excludes `mapLink`, which gates this block too).

- [ ] **Step 5: Commit**

```bash
git add components/WorkoutDetails.tsx
git commit -m "#460: render route narrative in expanded run detail"
```

---

### Task 10: `shouldGenerateDirections` + form wiring (Add/Edit) with Regenerate

**Files:**
- Create: `lib/routeDirections/shouldGenerate.ts`
- Test: `__tests__/routeDirections/shouldGenerate.test.ts`
- Modify: `components/AddWorkoutForm.tsx`
- Modify: `components/EditWorkoutForm.tsx`

**Interfaces:**
- Consumes: `/api/route/directions`.
- Produces: `shouldGenerateDirections(args: { routeUrl: string; storedUrl: string | null; hasStoredNarrative: boolean }): boolean`; form field `routeNarrative`.

- [ ] **Step 1: Write the failing test (this pins the idempotency Review Focus items)**

`__tests__/routeDirections/shouldGenerate.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { shouldGenerateDirections } from '@/lib/routeDirections/shouldGenerate'

it('generates when creating (no stored narrative, url present)', () => {
  expect(shouldGenerateDirections({ routeUrl: 'https://strava/1', storedUrl: null, hasStoredNarrative: false })).toBe(true)
})
it('keeps the stored narrative when the url is unchanged', () => {
  expect(shouldGenerateDirections({ routeUrl: 'https://strava/1', storedUrl: 'https://strava/1', hasStoredNarrative: true })).toBe(false)
})
it('regenerates when the url changed', () => {
  expect(shouldGenerateDirections({ routeUrl: 'https://strava/2', storedUrl: 'https://strava/1', hasStoredNarrative: true })).toBe(true)
})
it('does not generate when the url is cleared', () => {
  expect(shouldGenerateDirections({ routeUrl: '   ', storedUrl: 'https://strava/1', hasStoredNarrative: true })).toBe(false)
})
it('regenerates a changed url even if it had no prior narrative', () => {
  expect(shouldGenerateDirections({ routeUrl: 'https://strava/2', storedUrl: 'https://strava/1', hasStoredNarrative: false })).toBe(true)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run __tests__/routeDirections/shouldGenerate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

`lib/routeDirections/shouldGenerate.ts`:
```ts
export function shouldGenerateDirections(args: { routeUrl: string; storedUrl: string | null; hasStoredNarrative: boolean }): boolean {
  const url = args.routeUrl.trim()
  if (!url) return false
  if (!args.hasStoredNarrative) return true
  return url !== (args.storedUrl ?? '').trim()
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/routeDirections/shouldGenerate.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire `AddWorkoutForm.tsx`**

- Add state near the other route state:
```ts
  const [routeNarrative, setRouteNarrative] = useState<string | null>(null)
  const [directionsPending, setDirectionsPending] = useState(false)
```
- In `handleEntry`, alongside `enrichPromise`, add a concurrent directions fetch (Add form always generates when a route is present — no stored narrative):
```ts
    const directionsPromise: Promise<void> =
      shouldGenerateDirections({ routeUrl: entry.route, storedUrl: null, hasStoredNarrative: false })
        ? fetch('/api/route/directions', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: entry.route, name: entry.name, distanceMiles: null }),
          })
            .then(r => (r.ok ? r.json() : null))
            .then(d => setRouteNarrative(d?.narrative ?? null))
            .catch(() => setRouteNarrative(null))
        : Promise.resolve().then(() => setRouteNarrative(null))
```
- `await directionsPromise` next to `await enrichPromise` before `setStep('review')`.
- In `buildFormData`, add:
```ts
    formData.set('routeNarrative', routeNarrative ?? '')
```
- In the review step JSX (near the distance/elevation fields), add an editable text area + Regenerate control:
```tsx
      {entry.route.trim() && (
        <div className="space-y-1">
          <label className="font-semibold text-gray-700">Route directions</label>
          <textarea
            className="w-full rounded-lg border border-gray-300 p-2 text-sm touch-manipulation"
            rows={4}
            value={routeNarrative ?? ''}
            onChange={e => setRouteNarrative(e.target.value || null)}
            placeholder="No route directions generated."
          />
          <button
            type="button"
            aria-label="Regenerate route directions"
            className="text-xs font-semibold text-blue-500 touch-manipulation"
            disabled={directionsPending}
            onClick={async () => {
              setDirectionsPending(true)
              try {
                const r = await fetch('/api/route/directions', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ url: entry.route, name: entry.name, distanceMiles: null }),
                })
                const d = r.ok ? await r.json() : null
                setRouteNarrative(d?.narrative ?? null)
              } catch { /* leave current text */ } finally { setDirectionsPending(false) }
            }}
          >
            {directionsPending ? 'Regenerating…' : 'Regenerate'}
          </button>
        </div>
      )}
```
- Import the helper: `import { shouldGenerateDirections } from '@/lib/routeDirections/shouldGenerate'`.

- [ ] **Step 6: Wire `EditWorkoutForm.tsx`**

- Seed state from the existing variant:
```ts
  const [routeNarrative, setRouteNarrative] = useState<string | null>(variant.routeNarrative ?? null)
  const [directionsPending, setDirectionsPending] = useState(false)
```
- In `handleEntry`, gate the directions fetch on `shouldGenerateDirections` against the stored values (this is the idempotency path — unchanged url keeps `variant.routeNarrative`):
```ts
    const directionsPromise: Promise<void> =
      shouldGenerateDirections({ routeUrl: entry.route, storedUrl: variant.mapLink, hasStoredNarrative: !!variant.routeNarrative })
        ? fetch('/api/route/directions', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: entry.route, name: entry.name, distanceMiles: null }),
          })
            .then(r => (r.ok ? r.json() : null))
            .then(d => setRouteNarrative(d?.narrative ?? null))
            .catch(() => { /* keep the seeded narrative on failure */ })
        : entry.route.trim()
          ? Promise.resolve() // url unchanged -> keep variant.routeNarrative already in state
          : Promise.resolve().then(() => setRouteNarrative(null)) // route cleared -> clear
```
- `await directionsPromise` next to `await enrichPromise`.
- Add the same `formData.set('routeNarrative', routeNarrative ?? '')` in `buildFormData`.
- Add the same editable text area + Regenerate control from Step 5 to the review JSX.
- Import `shouldGenerateDirections`.

- [ ] **Step 7: Typecheck + run the full unit suite**

Run: `npx tsc --noEmit` → clean.
Run: `npm run test:unit` → all green.

- [ ] **Step 8: Manual verification on Preview**

On the PR Preview URL, signed in as a leader:
1. Create a run with a Strava route link → advancing shows a generated narrative; edit the wording; save; reopen → your text persists.
2. Create a run with a MapMyRun link → narrative generates.
3. Edit that run without touching the link → narrative unchanged (your edits survive).
4. Edit and change the link to a different route → narrative regenerates for the new route.
5. Edit and clear the link → narrative clears.
6. Click Regenerate → a fresh narrative replaces the current text.
7. Add `{{route_narrative}}` to the run's Heylo template → the post includes it; remove it → post omits it.

- [ ] **Step 9: Commit**

```bash
git add lib/routeDirections/shouldGenerate.ts __tests__/routeDirections/shouldGenerate.test.ts components/AddWorkoutForm.tsx components/EditWorkoutForm.tsx
git commit -m "#460: generate/regenerate route directions in create-edit forms"
```

---

## Post-implementation (before "done")

- [ ] `npm run test:unit` and `npx tsc --noEmit` both clean.
- [ ] `migrate-460.sql` applied to **Preview** + **test-data**; verified the column exists (`SELECT route_narrative FROM workout_families LIMIT 1;`).
- [ ] `MAPBOX_TOKEN` set in Vercel **Preview** + **Production**.
- [ ] Confirm `ANTHROPIC_API_KEY` is present for Preview (needed by both `/api/workout/infer` and the new endpoint).
- [ ] Open the PR with **Test plan (Claude)** and **Manual steps (Lou)** sections + the full AC list from #460. Note the file count and remind Lou to run `/review`.
- [ ] At merge: apply `migrate-460.sql` to **production** and **demo-data** (plain apply; no full `refresh-demo.ts` needed). This PR touches `scripts/migrate-460.sql`, so it'll be auto-flagged `data-model-change` — additive/idempotent, safe to let auto-apply run on demo.
