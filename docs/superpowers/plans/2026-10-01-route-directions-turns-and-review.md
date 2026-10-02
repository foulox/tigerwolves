# Route Directions — Turns, Distances & Forced Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich route-based run directions with turn directions + per-street distances (landmark-aware, never-fabricated), and force the leader to review them at creation and in the Heylo post.

**Architecture:** Keep the output a prose read-aloud narrative in the existing `route_narrative` field. Extend the `lib/routeDirections` pipeline to carry the per-step distance + geometry the Mapbox map-match already returns (today discarded); aggregate consecutive same-street steps into legs; compute each turn from the **trace geometry's bearing change** (robust to Mapbox's ~100-coord chunk boundary, which blurs per-step maneuvers) and classify it; classify each leg's feature (bridge/park/street) for phrasing; feed structured legs + landmarks to a new prompt. Then two UX changes surface the result for review.

**Tech Stack:** TypeScript, Next.js (App Router), Vitest, Neon Postgres (`@neondatabase/serverless`), Mapbox Map-Matching + Tilequery, Anthropic SDK.

**Spec:** `docs/superpowers/specs/2026-10-01-route-directions-turns-and-review-design.md`

## Global Constraints

- Output stays **prose** in `workout_families.route_narrative` (TEXT). No schema change.
- `LatLng` is `[lat, lng]`. Mapbox GeoJSON coordinates are `[lng, lat]` — convert on ingest.
- **Never fabricate a turn direction.** When a turn can't be computed (insufficient geometry), the leg carries turn `'none'` and the prose says "onto"/"pick up", never a guessed left/right.
- Landmark-aware phrasing: street name matching `/bridge/i` → describe without L/R; leg matching a park landmark or `/park/i` → keep L/R; plain street → state L/R only when computed.
- Turn/post route text applies to **route-based runs only** (category `Easy` or `Long`).
- Reuse dependency-injection pattern already in `generateNarrative` (`deps` param) for testability.
- Run tests with `npx vitest run <file>`; full suite `npm run test:unit`.

## Review Focus

- **Route that won't map-match at all** (e.g. Berry Nice): `generateNarrative` must still return `null`, not throw. → pinned in Task 5.
- **Leg boundary with < 2 coordinates on either side**: turn classification must return `'none'`, not crash or guess. → pinned in Task 1.
- **Point-to-point route** (`shape.returnsToStart === false`): must not emit a "turn around". → pinned in Task 3 (turnaround only from a ~180° geometry reversal, not from shape alone).
- **All-unnamed route** (every step `name === ''`): aggregation yields zero named legs → prompt still produces a landmark-only paragraph or `generateNarrative` returns the landmark fallback, never an empty/garbage string. → pinned in Task 4.
- **Non-route (Quality) run reaching the post builder**: `route_narrative` must NOT be injected into the post. → pinned in Task 7.

---

### Task 1: Geometry bearing + turn classification

**Files:**
- Modify: `lib/routeDirections/geo.ts`
- Modify: `lib/routeDirections/types.ts`
- Test: `__tests__/routeDirections/geo.test.ts` (create)

**Interfaces:**
- Produces: `bearing(a: LatLng, b: LatLng): number` (0–360); `classifyTurn(incoming: LatLng[], outgoing: LatLng[]): TurnKind`; `type TurnKind = 'none'|'slight left'|'left'|'sharp left'|'slight right'|'right'|'sharp right'|'turnaround'`.

- [ ] **Step 1: Add `TurnKind` to types.ts**

```ts
// append to lib/routeDirections/types.ts
export type TurnKind =
  | 'none' | 'slight left' | 'left' | 'sharp left'
  | 'slight right' | 'right' | 'sharp right' | 'turnaround'
```

- [ ] **Step 2: Write the failing test**

```ts
// __tests__/routeDirections/geo.test.ts
import { describe, it, expect } from 'vitest'
import { bearing, classifyTurn } from '@/lib/routeDirections/geo'

describe('bearing', () => {
  it('is ~0 heading due north and ~90 due east', () => {
    expect(bearing([0, 0], [1, 0])).toBeCloseTo(0, 0)
    expect(bearing([0, 0], [0, 1])).toBeCloseTo(90, 0)
  })
})

describe('classifyTurn', () => {
  const straight = { incoming: [[0, 0], [0, 1]] as [number,number][], outgoing: [[0, 1], [0, 2]] as [number,number][] }
  it('returns none when the heading barely changes', () => {
    expect(classifyTurn(straight.incoming, straight.outgoing)).toBe('none')
  })
  it('returns right for a ~90° clockwise change', () => {
    // heading east then turning to head south
    expect(classifyTurn([[0, 0], [0, 1]], [[0, 1], [-1, 1]])).toBe('right')
  })
  it('returns left for a ~90° counter-clockwise change', () => {
    expect(classifyTurn([[0, 0], [0, 1]], [[0, 1], [1, 1]])).toBe('left')
  })
  it('returns turnaround for a ~180° reversal', () => {
    expect(classifyTurn([[0, 0], [0, 1]], [[0, 1], [0, 0]])).toBe('turnaround')
  })
  it('returns none when either side has fewer than 2 points', () => {
    expect(classifyTurn([[0, 0]], [[0, 1], [0, 2]])).toBe('none')
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run __tests__/routeDirections/geo.test.ts`
Expected: FAIL — `bearing`/`classifyTurn` not exported.

- [ ] **Step 4: Implement in geo.ts**

```ts
// append to lib/routeDirections/geo.ts
import type { TurnKind } from './types'

export function bearing(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const toDeg = (r: number) => (r * 180) / Math.PI
  const dLon = toRad(b[1] - a[1])
  const y = Math.sin(dLon) * Math.cos(toRad(b[0]))
  const x = Math.cos(toRad(a[0])) * Math.sin(toRad(b[0])) - Math.sin(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.cos(dLon)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

export function classifyTurn(incoming: LatLng[], outgoing: LatLng[]): TurnKind {
  if (incoming.length < 2 || outgoing.length < 2) return 'none'
  const inB = bearing(incoming[incoming.length - 2], incoming[incoming.length - 1])
  const outB = bearing(outgoing[0], outgoing[1])
  let delta = ((outB - inB + 540) % 360) - 180 // signed, [-180, 180]; +right, -left
  const mag = Math.abs(delta)
  if (mag > 150) return 'turnaround'
  if (mag < 30) return 'none'
  const side = delta > 0 ? 'right' : 'left'
  if (mag < 60) return `slight ${side}` as TurnKind
  if (mag <= 120) return side as TurnKind
  return `sharp ${side}` as TurnKind
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run __tests__/routeDirections/geo.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/routeDirections/geo.ts lib/routeDirections/types.ts __tests__/routeDirections/geo.test.ts
git commit -m "feat(routeDirections): bearing + geometry-based turn classification"
```

---

### Task 2: Map-match returns structured steps (name + distance + coords)

**Files:**
- Modify: `lib/routeDirections/mapMatch.ts`
- Modify: `lib/routeDirections/types.ts`
- Modify: `__tests__/routeDirections/mapMatch.test.ts`

**Interfaces:**
- Consumes: `chunkPoints` (unchanged).
- Produces: `type MatchedStep = { name: string; meters: number; coords: LatLng[] }`; `mapMatch(points, token, fetchImpl?): Promise<MatchedStep[]>`. (The old `stitchStreets`/string-returning `mapMatch` is replaced.)

- [ ] **Step 1: Add `MatchedStep` to types.ts**

```ts
// append to lib/routeDirections/types.ts
export type MatchedStep = { name: string; meters: number; coords: LatLng[] }
```

- [ ] **Step 2: Write the failing test**

```ts
// replace body of __tests__/routeDirections/mapMatch.test.ts
import { describe, it, expect } from 'vitest'
import { mapMatch } from '@/lib/routeDirections/mapMatch'
import type { LatLng } from '@/lib/routeDirections/types'

const fakeMapbox = (steps: { name: string; distance: number; coords: [number, number][] }[]) =>
  (async () => ({
    ok: true,
    json: async () => ({ code: 'Ok', matchings: [{ legs: [{ steps: steps.map(s => ({ name: s.name, distance: s.distance, geometry: { coordinates: s.coords } })) }] }] }),
  })) as unknown as typeof fetch

it('returns structured steps with name, meters and [lat,lng] coords', async () => {
  const pts: LatLng[] = [[40, -73], [40.01, -73]]
  const out = await mapMatch(pts, 'tok', fakeMapbox([
    { name: 'Driggs Avenue', distance: 100, coords: [[-73, 40], [-73, 40.01]] },
  ]))
  expect(out).toEqual([{ name: 'Driggs Avenue', meters: 100, coords: [[40, -73], [40.01, -73]] }])
})

it('returns [] when the token is missing', async () => {
  expect(await mapMatch([[40, -73], [40.01, -73]], '')).toEqual([])
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run __tests__/routeDirections/mapMatch.test.ts`
Expected: FAIL — `mapMatch` returns `string[]`.

- [ ] **Step 4: Rewrite mapMatch.ts**

```ts
import type { LatLng, MatchedStep } from './types'

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

type RawStep = { name?: string; distance?: number; geometry?: { coordinates?: [number, number][] } }

async function matchChunk(chunk: LatLng[], token: string, fetchImpl: typeof fetch): Promise<MatchedStep[]> {
  const coords = chunk.map(([lat, lng]) => `${lng},${lat}`).join(';')
  const radiuses = chunk.map(() => '25').join(';')
  const qs = new URLSearchParams({ geometries: 'geojson', steps: 'true', overview: 'full', tidy: 'true', radiuses, access_token: token })
  const url = `https://api.mapbox.com/matching/v5/mapbox/walking/${coords}?${qs.toString()}`
  try {
    const res = await fetchImpl(url)
    if (!res.ok) return []
    const data = (await res.json()) as { code?: string; matchings?: { legs?: { steps?: RawStep[] }[] }[] }
    if (data.code !== 'Ok' || !data.matchings) return []
    const out: MatchedStep[] = []
    for (const m of data.matchings) for (const leg of m.legs ?? []) for (const s of leg.steps ?? []) {
      const coords = (s.geometry?.coordinates ?? []).map(([lng, lat]) => [lat, lng] as LatLng)
      out.push({ name: s.name ?? '', meters: s.distance ?? 0, coords })
    }
    return out
  } catch {
    return []
  }
}

// Map-match a full GPS trace to ordered steps (name + distance + geometry).
// Turn direction is derived later from the geometry, not from Mapbox's per-step
// maneuver, so chunk boundaries don't drop turns.
export async function mapMatch(points: LatLng[], token: string, fetchImpl: typeof fetch = fetch): Promise<MatchedStep[]> {
  if (!token || points.length < 2) return []
  const all: MatchedStep[] = []
  for (const chunk of chunkPoints(points)) all.push(...(await matchChunk(chunk, token, fetchImpl)))
  return all
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run __tests__/routeDirections/mapMatch.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/routeDirections/mapMatch.ts lib/routeDirections/types.ts __tests__/routeDirections/mapMatch.test.ts
git commit -m "feat(routeDirections): map-match returns structured steps (name+distance+coords)"
```

---

### Task 3: Aggregate steps into legs with turn + turnaround

**Files:**
- Create: `lib/routeDirections/legs.ts`
- Modify: `lib/routeDirections/types.ts`
- Test: `__tests__/routeDirections/legs.test.ts` (create)

**Interfaces:**
- Consumes: `MatchedStep`, `classifyTurn` (Task 1), `TurnKind`.
- Produces: `type RouteLeg = { street: string; miles: number; turn: TurnKind; feature: FeatureKind }`; `buildLegs(steps: MatchedStep[], minMiles?: number): RouteLeg[]` (feature set to `'street'` here; Task 4 refines). Aggregates consecutive same-name steps, computes the turn INTO each leg from adjacent geometry, filters to named legs ≥ `minMiles` (default 0.1).

- [ ] **Step 1: Add `FeatureKind` + `RouteLeg` to types.ts**

```ts
// append to lib/routeDirections/types.ts
export type FeatureKind = 'bridge' | 'park' | 'street'
export type RouteLeg = { street: string; miles: number; turn: TurnKind; feature: FeatureKind }
```

- [ ] **Step 2: Write the failing test**

```ts
// __tests__/routeDirections/legs.test.ts
import { describe, it, expect } from 'vitest'
import { buildLegs } from '@/lib/routeDirections/legs'
import type { MatchedStep } from '@/lib/routeDirections/types'

const M = 1609.344
const step = (name: string, miles: number, coords: [number, number][]): MatchedStep => ({ name, meters: miles * M, coords })

it('merges consecutive same-street steps and sums distance', () => {
  const legs = buildLegs([step('Driggs Avenue', 0.3, [[0, 0], [0, 1]]), step('Driggs Avenue', 0.3, [[0, 1], [0, 2]])])
  expect(legs).toHaveLength(1)
  expect(legs[0].street).toBe('Driggs Avenue')
  expect(legs[0].miles).toBeCloseTo(0.6, 2)
})

it('drops unnamed and sub-threshold legs', () => {
  const legs = buildLegs([step('', 0.5, [[0, 0], [0, 1]]), step('Meeker Avenue', 0.02, [[0, 1], [0, 1.01]])])
  expect(legs).toHaveLength(0)
})

it('computes the turn INTO each kept leg from geometry', () => {
  // head east on A, then turn to head south on B
  const legs = buildLegs([step('A St', 0.3, [[0, 0], [0, 1]]), step('B St', 0.3, [[0, 1], [-1, 1]])])
  expect(legs.map(l => l.turn)).toEqual(['none', 'right'])
})

it('marks the out-and-back reversal as turnaround', () => {
  const legs = buildLegs([step('A St', 0.3, [[0, 0], [0, 1]]), step('A St', 0.3, [[0, 1], [0, 0]])])
  // same street both ways would merge; use a named connector to keep them distinct
  const legs2 = buildLegs([step('A St', 0.3, [[0, 0], [0, 1]]), step('B St', 0.3, [[0, 1], [0, 0]])])
  expect(legs2[1].turn).toBe('turnaround')
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run __tests__/routeDirections/legs.test.ts`
Expected: FAIL — `legs.ts` does not exist.

- [ ] **Step 4: Implement legs.ts**

```ts
import type { LatLng, MatchedStep, RouteLeg, TurnKind } from './types'
import { classifyTurn } from './geo'

const MILE = 1609.344

type Agg = { name: string; meters: number; coords: LatLng[] }

function aggregate(steps: MatchedStep[]): Agg[] {
  const legs: Agg[] = []
  for (const s of steps) {
    const last = legs[legs.length - 1]
    if (last && last.name === s.name) { last.meters += s.meters; last.coords.push(...s.coords); continue }
    legs.push({ name: s.name, meters: s.meters, coords: [...s.coords] })
  }
  return legs
}

export function buildLegs(steps: MatchedStep[], minMiles = 0.1): RouteLeg[] {
  const aggs = aggregate(steps)
  const out: RouteLeg[] = []
  for (let i = 0; i < aggs.length; i++) {
    const a = aggs[i]
    if (!a.name || a.meters / MILE < minMiles) continue
    const prev = aggs[i - 1]
    const turn: TurnKind = prev ? classifyTurn(prev.coords, a.coords) : 'none'
    out.push({ street: a.name, miles: a.meters / MILE, turn, feature: 'street' })
  }
  return out
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run __tests__/routeDirections/legs.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/routeDirections/legs.ts lib/routeDirections/types.ts __tests__/routeDirections/legs.test.ts
git commit -m "feat(routeDirections): aggregate steps into legs with geometry-derived turns"
```

---

### Task 4: Classify leg feature (bridge / park / street)

**Files:**
- Modify: `lib/routeDirections/legs.ts`
- Modify: `__tests__/routeDirections/legs.test.ts`

**Interfaces:**
- Consumes: `RouteLeg`, `LandmarkCandidate`.
- Produces: `classifyFeature(street: string, landmarks: LandmarkCandidate[]): FeatureKind`; `buildLegs` gains a 2nd param `landmarks` and sets each leg's `feature`.

- [ ] **Step 1: Write the failing test (append)**

```ts
// append to __tests__/routeDirections/legs.test.ts
import { classifyFeature } from '@/lib/routeDirections/legs'
import type { LandmarkCandidate } from '@/lib/routeDirections/types'

const lm = (name: string): LandmarkCandidate => ({ name, anchor: 'turnaround', distanceMeters: 10 })

it('classifies bridges by name', () => {
  expect(classifyFeature('Kosciuszko Bridge', [])).toBe('bridge')
})
it('classifies parks by name or nearby landmark', () => {
  expect(classifyFeature('McCarren Park Drive', [])).toBe('park')
  expect(classifyFeature('North 12th Street', [lm('McGolrick Park')])).toBe('park')
})
it('defaults to street', () => {
  expect(classifyFeature('Meeker Avenue', [lm('Sparta Deli')])).toBe('street')
})
it('buildLegs sets feature from landmarks', () => {
  const legs = buildLegs([{ name: 'Kosciuszko Bridge', meters: 1400, coords: [[0, 0], [0, 1]] }], 0.1, [])
  expect(legs[0].feature).toBe('bridge')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/routeDirections/legs.test.ts`
Expected: FAIL — `classifyFeature` not exported; `buildLegs` arity.

- [ ] **Step 3: Implement (edit legs.ts)**

```ts
// add import
import type { LandmarkCandidate } from './types'

export function classifyFeature(street: string, landmarks: LandmarkCandidate[]): FeatureKind {
  if (/bridge/i.test(street)) return 'bridge'
  if (/\bpark\b/i.test(street)) return 'park'
  if (landmarks.some(l => /\bpark\b/i.test(l.name))) return 'park'
  return 'street'
}

// change signature + feature assignment in buildLegs:
export function buildLegs(steps: MatchedStep[], minMiles = 0.1, landmarks: LandmarkCandidate[] = []): RouteLeg[] {
  // ...unchanged aggregation...
  // when pushing: feature: classifyFeature(a.name, landmarks)
}
```
(Add `import type { FeatureKind } from './types'` if not already present; replace the `feature: 'street'` literal with `classifyFeature(a.name, landmarks)`.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run __tests__/routeDirections/legs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/routeDirections/legs.ts __tests__/routeDirections/legs.test.ts
git commit -m "feat(routeDirections): classify leg feature (bridge/park/street)"
```

---

### Task 5: New DirectionsInput + prompt, and wire generateNarrative

**Files:**
- Modify: `lib/routeDirections/types.ts` (DirectionsInput: `streets: string[]` → `legs: RouteLeg[]`)
- Modify: `lib/routeDirections/prompt.ts`
- Modify: `lib/routeDirections/index.ts`
- Modify: `__tests__/routeDirections/prompt.test.ts`, `__tests__/routeDirections/generate.test.ts`

**Interfaces:**
- Consumes: `buildLegs` (Tasks 3–4), `mapMatch` → `MatchedStep[]` (Task 2), `landmarks`, `analyzeShape`.
- Produces: unchanged public `generateNarrative(args, deps?)` returning `string | null`; `GenerateDeps.mapMatch` now `(points, token) => Promise<MatchedStep[]>`.

- [ ] **Step 1: Change DirectionsInput in types.ts**

```ts
// in DirectionsInput, replace `streets: string[]` with:
  legs: RouteLeg[]
```

- [ ] **Step 2: Write failing prompt test**

```ts
// replace __tests__/routeDirections/prompt.test.ts body
import { describe, it, expect } from 'vitest'
import { buildDirectionsPrompt } from '@/lib/routeDirections/prompt'
import type { DirectionsInput } from '@/lib/routeDirections/types'

const base: DirectionsInput = {
  routeName: 'K Bridge', distanceMiles: 3.7, shape: { returnsToStart: true, startToEndMeters: 10 },
  legs: [
    { street: 'Driggs Avenue', miles: 0.5, turn: 'none', feature: 'street' },
    { street: 'Kosciuszko Bridge', miles: 0.85, turn: 'right', feature: 'bridge' },
  ],
  landmarks: [{ name: 'Uro Cafe', anchor: 'start', distanceMeters: 20 }],
}

it('lists legs with turn + distance and states the phrasing rules', () => {
  const p = buildDirectionsPrompt(base)
  expect(p).toContain('Driggs Avenue')
  expect(p).toContain('0.5')
  expect(p).toMatch(/bridge/i)
  expect(p).toMatch(/never.*(invent|fabricate)/i)
  expect(p).toMatch(/turn around|turnaround/i)
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run __tests__/routeDirections/prompt.test.ts`
Expected: FAIL — prompt still references `streets`.

- [ ] **Step 4: Rewrite prompt.ts**

```ts
import type { DirectionsInput } from './types'

export function buildDirectionsPrompt(input: DirectionsInput): string {
  const shape = input.shape.returnsToStart ? 'returns to its start (loop or out-and-back)' : 'point-to-point'
  const leg = (l: DirectionsInput['legs'][number], i: number) => {
    const turn = l.turn === 'none' ? 'continue onto' : l.turn === 'turnaround' ? 'TURN AROUND, then' : `turn ${l.turn} onto`
    const feat = l.feature === 'bridge' ? ' [bridge]' : l.feature === 'park' ? ' [park]' : ''
    return `  ${i + 1}. ${turn} ${l.street}${feat} — ${l.miles.toFixed(2)} mi`
  }
  return [
    'You are writing a short, read-aloud route description for a running-club leader to say to their group.',
    'Compose 2-5 sentences, plain spoken tone. Return only the paragraph.',
    '',
    'STRICT RULES:',
    '- Use ONLY the street and landmark names provided. NEVER invent or fabricate a name or a turn direction not given below.',
    '- Follow the legs in order. Weave in the distance for named stretches ("follow Meeker Avenue for about a mile"); round naturally; skip distances for short connectors.',
    '- A leg marked [bridge]: describe the move ("onto the Kosciuszko Bridge") WITHOUT a left/right — the direction is obvious.',
    '- A leg marked [park]: KEEP the left/right — entry direction matters.',
    '- A leg with "continue onto": do NOT state a left/right (we are not sure); just say "onto" or "pick up".',
    '- "TURN AROUND" is the route turnaround — phrase it as turning around / heading back the same way, never a left/right.',
    '- Mention start/turnaround landmarks where natural. No compass bearings.',
    '',
    `Route: ${input.routeName ?? '(unnamed)'}`,
    input.distanceMiles != null ? `Total distance: ${input.distanceMiles.toFixed(1)} miles` : 'Total distance: unknown',
    `Shape: ${shape}`,
    '',
    'Legs in order (instruction | street | distance):',
    ...input.legs.map(leg),
    '',
    'Landmarks (name @ anchor):',
    ...input.landmarks.map(l => `  - ${l.name} @ ${l.anchor}`),
  ].join('\n')
}
```

- [ ] **Step 5: Run prompt test to verify it passes**

Run: `npx vitest run __tests__/routeDirections/prompt.test.ts`
Expected: PASS.

- [ ] **Step 6: Wire index.ts**

```ts
// update imports
import type { LatLng, DirectionsInput, MatchedStep } from './types'
import { buildLegs } from './legs'
// ...

export type GenerateDeps = {
  fetchFullTrace: (url: string) => Promise<LatLng[]>
  mapMatch: (points: LatLng[], token: string) => Promise<MatchedStep[]>
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

  const [steps, marks] = await Promise.all([mapMatch(trace, token), landmarks(trace, token)])
  const legs = buildLegs(steps, 0.1, marks)
  if (legs.length === 0 && marks.length === 0) return null

  const input: DirectionsInput = {
    routeName: args.routeName ?? null,
    distanceMiles: args.distanceMiles ?? null,
    legs,
    shape: analyzeShape(trace),
    landmarks: marks,
  }
  const narrative = await composeNarrative(input)
  return narrative.trim() || null
}
```

- [ ] **Step 7: Update generate.test.ts (mock deps to new shapes) and verify**

Update any `mapMatch` mock to resolve `MatchedStep[]` and any `DirectionsInput` fixture to use `legs`. Add:

```ts
it('returns null when the trace will not map-match and there are no landmarks', async () => {
  const n = await generateNarrative({ url: 'x', routeName: 'R', distanceMiles: 3 }, {
    fetchFullTrace: async () => [[0, 0], [0, 1]],
    mapMatch: async () => [],
    landmarks: async () => [],
    composeNarrative: async () => 'should not be called',
  })
  expect(n).toBeNull()
})
```

Run: `npx vitest run __tests__/routeDirections/generate.test.ts __tests__/routeDirections/prompt.test.ts`
Expected: PASS.

- [ ] **Step 8: Run the whole routeDirections suite + typecheck**

Run: `npx vitest run __tests__/routeDirections && npx tsc --noEmit`
Expected: PASS, no type errors. (Fix any other references to `DirectionsInput.streets` or the old `mapMatch` return — grep `streets` and `stitchStreets` under `lib`/`__tests__` and update/remove.)

- [ ] **Step 9: Commit**

```bash
git add lib/routeDirections __tests__/routeDirections
git commit -m "feat(routeDirections): turn+distance+landmark-aware prompt, wired end to end"
```

---

### Task 6: Creation form — pull directions to top of review (soft)

**Files:**
- Modify: `components/AddWorkoutForm.tsx` (review-step JSX, ~lines 211–346)
- Modify: `components/EditWorkoutForm.tsx` (same block)

**Interfaces:** none (pure JSX reorder + copy).

- [ ] **Step 1: Move the route-directions block**

In `AddWorkoutForm.tsx`, cut the Route Directions block (the `{entry.route.trim() && ( ... textarea ... Regenerate ... )}` group, ~lines 313–346) and paste it **immediately after the Workout Summary Card** (after ~line 215, before the Author/Source field). Prepend a callout inside the block:

```tsx
<p className="text-sm font-medium text-gray-900">Route directions — read this aloud to check it</p>
<p className="text-xs text-gray-500 mb-1">You&apos;re the editor. Fix any wrong turn or missing street before saving.</p>
```

- [ ] **Step 2: Repeat verbatim in EditWorkoutForm.tsx**

Apply the identical move + callout in `EditWorkoutForm.tsx`.

- [ ] **Step 3: Verify build + typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (No unit test — pure presentational reorder; verified manually on Preview in Task 8's manual check.)

- [ ] **Step 4: Commit**

```bash
git add components/AddWorkoutForm.tsx components/EditWorkoutForm.tsx
git commit -m "feat(workout-form): surface route directions at top of review with a read-aloud callout"
```

---

### Task 7: Heylo post — include route narrative for route-based runs

**Files:**
- Modify: `lib/postBuilder.ts`
- Modify: `__tests__/postBuilder.test.ts`

**Interfaces:**
- Consumes: the existing `buildPost(...)` and default-template path; the workout record's `routeNarrative`/`route_narrative` and run `kind`/category.

- [ ] **Step 1: Write the failing test**

```ts
// append to __tests__/postBuilder.test.ts — follow the file's existing buildPost fixture style
it('includes the route narrative in the post for a route-based (Easy) run', () => {
  const post = buildPostFixture({ category: 'Easy', routeNarrative: 'Head out on Driggs for half a mile, then turn right onto the Kosciuszko Bridge.' })
  expect(post).toContain('turn right onto the Kosciuszko Bridge')
})

it('does NOT include a route narrative for a Quality run', () => {
  const post = buildPostFixture({ category: 'Quality', routeNarrative: 'should not appear' })
  expect(post).not.toContain('should not appear')
})
```
(Use the file's established way of invoking `buildPost` — build the `entry`, `selections`, `runConfig` the same way the existing tests do; `buildPostFixture` here denotes "construct via the existing pattern", not a new helper. If the existing tests call `buildPost(...)` directly, mirror that call with a route-based selection carrying `routeNarrative`.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/postBuilder.test.ts`
Expected: FAIL — narrative not rendered by default.

- [ ] **Step 3: Implement in postBuilder.ts**

In the default-template render path, when the selected workout's category is `Easy` or `Long` and `route_narrative` is non-empty, append it (labeled, e.g. `Route: <narrative>`) to the rendered post — alongside the existing `{{route_link}}`/`{{distance}}` route fields. Reuse the existing `route_narrative` POST_FIELDS entry (`lib/postBuilder.ts` ~line 85) for the value lookup so there is one source of truth. Gate on category so Quality posts are unaffected.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run __tests__/postBuilder.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/postBuilder.ts __tests__/postBuilder.test.ts
git commit -m "feat(postBuilder): render route directions in the Heylo post for route-based runs"
```

---

### Task 8: Backfill all route-based runs (MNER + Mourning Doves), demo then prod + manual verification

Scope (confirmed 2026-10-01): regenerate narratives for **every route-based run**, not just MNER — on prod that's MNER (18 routes, 17 had old narratives) **and Mourning Doves** (42 routes, 0 narratives today → first-time generation). TigerWolves is a Workout run and is excluded. The script selects route-based families by run `kind <> 'Workout'`, so it self-adjusts per DB and to future route-based runs.

**Files:**
- Create: `scripts/regen-route-narratives.ts`

**Interfaces:** reuses `generateNarrative` (new), `sql` from `lib/db`, `op run` secret injection; mirrors `scripts/import-mner.ts` env/host-guard pattern.

- [ ] **Step 1: Write the regen script**

```ts
// scripts/regen-route-narratives.ts — regenerate route_narrative for ALL route-based runs
import { config } from 'dotenv'
config({ path: '.env.local' })
import { sql } from '../lib/db'
import { generateNarrative } from '../lib/routeDirections'

const EXPECTED: Record<string, string> = { demo: 'ep-ancient-math', prod: 'ep-super-waterfall' }

async function main() {
  const env = (process.argv.find(a => a.startsWith('--env='))?.split('=')[1]) ?? ''
  if (!EXPECTED[env]) throw new Error('pass --env=demo|prod')
  if (!new URL(process.env.DATABASE_URL ?? '').host.includes(EXPECTED[env])) throw new Error('HOST GUARD: DATABASE_URL does not match --env')
  // Route-based = any workout with a map_link whose run is not a Workout run.
  const rows = await sql`
    SELECT f.id, f.name, f.map_link, f.distance_miles
    FROM workout_families f
    WHERE f.map_link IS NOT NULL
      AND f.run_group_id IN (SELECT run_group_id FROM runs WHERE kind <> 'Workout' AND run_group_id IS NOT NULL)
  ` as any[]
  let ok = 0, none = 0
  for (const r of rows) {
    const n = await generateNarrative({ url: r.map_link, routeName: r.name, distanceMiles: r.distance_miles })
    await sql`UPDATE workout_families SET route_narrative = ${n} WHERE id = ${r.id}`
    if (n) ok++; else none++
    console.log(`${n ? '✓' : '∅'} ${r.name}${n ? ` (${n.length}ch)` : ' — no narrative'}`)
  }
  console.log(`Done: ${rows.length} routes (${ok} narrated, ${none} unmatched).`)
}
main().catch(e => { console.error('ERR', e.message); process.exit(1) })
```

- [ ] **Step 2: Run against demo**

```bash
NEON_KEY=$(grep '^NEON_API_KEY=' .env.local | cut -d= -f2-)
DEMO=$(curl -s -H "Authorization: Bearer $NEON_KEY" "https://console.neon.tech/api/v2/projects/purple-star-02119717/connection_uri?branch_id=br-little-rice-at9l08ja&database_name=neondb&role_name=neondb_owner" | jq -r .uri)
op run --env-file=.env.op -- env DATABASE_URL="$DEMO" npx tsx scripts/regen-route-narratives.ts --env=demo
```
Expected: ~60 routes processed (MNER + Mourning Doves). Most ✓ with turn+distance narratives; a handful ∅ where a route won't map-match (e.g. Berry Nice) — that's graceful, not a failure. Takes a few minutes (one Mapbox+Claude round-trip per route).

- [ ] **Step 3: Manual verification (demo)**

Spot-check narratives in the demo DB across BOTH runs — a street-grid route, a bridge route, a park/waterfront route, and 2–3 Mourning Doves routes: confirm turns read correctly, bridges have no fussed L/R, no fabricated turns, distances present. Then load `demo.tigerwolves.foulox.me` (Lou) and confirm the creation-review placement (Task 6) and the Heylo post inclusion (Task 7) look right on a route-based run.

- [ ] **Step 4: Run against prod**

```bash
PROD=$(grep -m1 '^DATABASE_URL=' .env.local | cut -d= -f2-); PROD="${PROD%\"}"; PROD="${PROD#\"}"
op run --env-file=.env.op -- env DATABASE_URL="$PROD" npx tsx scripts/regen-route-narratives.ts --env=prod
```
Expected: same across MNER + Mourning Doves on prod. New narratives appear within the ≤5-min cache window. **Note:** this is the first time Mourning Doves (a live Wednesday run) gets directions — its leaders will see them, so verify a sample before considering it done.

- [ ] **Step 5: Commit the script**

```bash
git add scripts/regen-route-narratives.ts
git commit -m "chore(scripts): regenerate route narratives for all route-based runs (turn+distance backfill)"
```

---

## Self-Review

**Spec coverage:** A (generation) → Tasks 1–5; A backfill → Task 8; B (creation placement) → Task 6; C (post inclusion) → Task 7. Landmark-aware phrasing → Tasks 4–5. Never-fabricate guard → Tasks 1 (turn `none` on thin geometry) + 5 (prompt rule). Turnaround → Tasks 1+3. All spec sections mapped.

**Placeholder scan:** No TBD/TODO. Task 7's `buildPostFixture` is explicitly defined as "use the file's existing buildPost call pattern," not a missing helper; the implementer mirrors the existing tests. Task 6 has no unit test by design (presentational reorder), verified manually in Task 8 — called out explicitly.

**Type consistency:** `MatchedStep` (Task 2) consumed in Tasks 3/5; `RouteLeg`/`FeatureKind`/`TurnKind` defined in Tasks 1/3 and used in 3/4/5; `DirectionsInput.legs` replaces `.streets` consistently in Task 5 (prompt + index + fixtures), with Step 8 grepping for stragglers; `GenerateDeps.mapMatch` return type updated in Task 5 to match Task 2.

**Review Focus:** all five lines pinned — won't-map-match (T5), thin-geometry turn (T1), point-to-point no-turnaround (T3), all-unnamed (T4 drops to zero legs; T5 returns landmark-only or null), Quality-run post (T7).
